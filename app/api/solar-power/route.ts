import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { decryptSolarSecret, encryptSolarSecret, SOLAREDGE_API_BASE_URL, SOLAREDGE_TOKEN_URL } from '@/lib/solaredge';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { solarToday, solarWindow, type SolarRange } from '@/lib/solar-calendar';

const SITE_TIME_ZONE = 'America/Los_Angeles';
const BLENDED_DAYTIME_RATE = 0.44;

type LocalTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };
type EnergyPoint = { time: LocalTime; kwh: number };
type PeriodTotal = { kwh: number; value: number };
type PeriodComparison = PeriodTotal & { previousKwh: number; previousValue: number };

class SolarEdgeHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null, readonly providerMessage: string | null) {
    super(`SolarEdge returned HTTP ${status}.`);
  }
}

function getLocalTime(date: Date): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

function localOrdinal(time: LocalTime) {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
}

function shiftLocalDays(time: LocalTime, days: number): LocalTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day + days, time.hour, time.minute, time.second));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
}

function shiftLocalMonths(time: LocalTime, months: number): LocalTime {
  const firstOfTarget = new Date(Date.UTC(time.year, time.month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    year: firstOfTarget.getUTCFullYear(),
    month: firstOfTarget.getUTCMonth() + 1,
    day: Math.min(time.day, lastDay),
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
}

function localIso(time: LocalTime) {
  let utc = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    utc += localOrdinal(time) - localOrdinal(getLocalTime(new Date(utc)));
  }
  return new Date(utc).toISOString();
}

function parsePointTime(value: unknown): LocalTime | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0', zone] = match;
  const parsed: LocalTime = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) };
  if (!zone || zone === 'Z') return parsed;
  return getLocalTime(new Date(value));
}

function toKilowattHours(value: unknown, unit: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalizedUnit = unit.toLowerCase().replace(/\s/g, '');
  if (normalizedUnit.includes('mwh')) return numeric * 1000;
  if (normalizedUnit.includes('kwh')) return numeric;
  return numeric / 1000;
}

function valuesFrom(payload: Record<string, unknown>) {
  if (Array.isArray(payload.values)) return payload.values as Array<Record<string, unknown>>;
  for (const key of ['energy', 'power', 'siteEnergy', 'sitePower']) {
    const nested = payload[key];
    if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).values)) {
      return (nested as Record<string, unknown>).values as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function measurementUnit(payload: Record<string, unknown>, fallback: string) {
  if (typeof payload.unit === 'string') return payload.unit;
  if (typeof payload.units === 'string') return payload.units;
  for (const key of ['energy', 'power', 'siteEnergy', 'sitePower']) {
    const nested = payload[key];
    if (nested && typeof nested === 'object') {
      const nestedPayload = nested as Record<string, unknown>;
      if (typeof nestedPayload.unit === 'string') return nestedPayload.unit;
      if (typeof nestedPayload.units === 'string') return nestedPayload.units;
    }
  }
  return fallback;
}

function energyPoints(payload: Record<string, unknown>): EnergyPoint[] {
  const unit = measurementUnit(payload, 'Wh');
  return valuesFrom(payload).flatMap((point) => {
    const time = parsePointTime(point.date ?? point.timestamp);
    const kwh = toKilowattHours(point.value, unit);
    return time && kwh !== null ? [{ time, kwh }] : [];
  });
}

function sumRange(points: EnergyPoint[], from: LocalTime, to: LocalTime) {
  const start = localOrdinal(from);
  const end = localOrdinal(to);
  return points.reduce((total, point) => {
    const at = localOrdinal(point.time);
    return at >= start && at < end ? total + point.kwh : total;
  }, 0);
}

function estimateValue(kwh: number, hourlyPoints?: EnergyPoint[]) {
  if (!hourlyPoints?.length) return kwh * BLENDED_DAYTIME_RATE;
  const weightedValue = hourlyPoints.reduce((total, point) => {
    const hour = point.time.hour;
    const rate = hour >= 16 && hour < 21 ? 0.58 : hour >= 6 && hour < 16 ? 0.42 : 0.33;
    return total + point.kwh * rate;
  }, 0);
  const measuredKwh = hourlyPoints.reduce((total, point) => total + point.kwh, 0);
  return weightedValue + Math.max(0, kwh - measuredKwh) * BLENDED_DAYTIME_RATE;
}

function comparison(points: EnergyPoint[], currentFrom: LocalTime, currentTo: LocalTime, previousFrom: LocalTime, previousTo: LocalTime, rates?: EnergyPoint[]): PeriodComparison {
  const kwh = sumRange(points, currentFrom, currentTo);
  const previousKwh = sumRange(points, previousFrom, previousTo);
  const currentRates = rates?.filter((point) => localOrdinal(point.time) >= localOrdinal(currentFrom) && localOrdinal(point.time) < localOrdinal(currentTo));
  const previousRates = rates?.filter((point) => localOrdinal(point.time) >= localOrdinal(previousFrom) && localOrdinal(point.time) < localOrdinal(previousTo));
  return { kwh, previousKwh, value: estimateValue(kwh, currentRates), previousValue: estimateValue(previousKwh, previousRates) };
}

async function getSolarJson(siteId: string, accessToken: string, from: LocalTime, to: LocalTime, resolution: string) {
  const url = new URL(`${SOLAREDGE_API_BASE_URL}/sites/${encodeURIComponent(siteId)}/energy`);
  url.search = new URLSearchParams({ from: localIso(from), to: localIso(to), resolution }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as Record<string, unknown>;
    const providerMessage = [problem.title, problem.detail]
      .filter((value): value is string => typeof value === 'string')
      .join(': ')
      .replace(/[\u0000-\u001f]+/g, ' ')
      .replace(/https?:\/\/\S+/g, '[URL]')
      .slice(0, 240);
    throw new SolarEdgeHttpError(response.status, response.headers.get('retry-after'), providerMessage || null);
  }
  return await response.json() as Record<string, unknown>;
}

function getDeviceList(payload: Record<string, unknown>) {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  for (const key of ['devices', 'device', 'inverters']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      if (Array.isArray(nested.device)) return nested.device as Array<Record<string, unknown>>;
      if (Array.isArray(nested.devices)) return nested.devices as Array<Record<string, unknown>>;
    }
  }
  return null;
}

async function getReportingInverterCount(siteId: string, accessToken: string) {
  const url = new URL(`${SOLAREDGE_API_BASE_URL}/sites/${encodeURIComponent(siteId)}/devices`);
  url.searchParams.set('types', 'INVERTER');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok) throw new SolarEdgeHttpError(response.status, response.headers.get('retry-after'), null);
  const payload = await response.json() as Record<string, unknown>;
  const devices = getDeviceList(payload);
  if (!devices) return null;
  let reportingCount = 0;
  for (const device of devices) {
    const type = String(device.type ?? device.deviceType ?? 'INVERTER').toUpperCase();
    if (type !== 'INVERTER') continue;
    if (typeof device.active === 'boolean') {
      if (device.active) reportingCount += 1;
      continue;
    }
    const status = String(device.status ?? device.communicationStatus ?? '').toUpperCase();
    if (['ACTIVE', 'ONLINE', 'REPORTING', 'CONNECTED'].includes(status)) {
      reportingCount += 1;
    } else if (!['INACTIVE', 'OFFLINE', 'NOT_REPORTING', 'DISCONNECTED'].includes(status)) {
      return null;
    }
  }
  return reportingCount;
}

function pointsToChart(points: EnergyPoint[], from: LocalTime, to: LocalTime, previousFrom: LocalTime, previousTo: LocalTime, range: string, intervalHours: number | ((point: EnergyPoint) => number)) {
  const rows = new Map<number, { slot: number; currentKw: number | null; previousKw: number | null }>();
  const currentStart = localOrdinal(from);
  const previousStart = localOrdinal(previousFrom);
  const currentEnd = localOrdinal(to);
  const previousEnd = localOrdinal(previousTo);
  for (const point of points) {
    const at = localOrdinal(point.time);
    const isCurrent = at >= currentStart && at < currentEnd;
    const isPrevious = at >= previousStart && at < previousEnd;
    if (!isCurrent && !isPrevious) continue;
    const base = isPrevious ? previousStart : currentStart;
    let slot = (at - base) / 3_600_000;
    if (range === 'day') slot = point.time.hour + point.time.minute / 60;
    if (range === 'month') slot = point.time.day - 1 + point.time.hour / 24;
    if (range === 'year') {
      const daysInMonth = new Date(Date.UTC(point.time.year, point.time.month, 0)).getUTCDate();
      slot = (point.time.month - 1) + (point.time.day - 1) / daysInMonth;
    }
    if (isPrevious && range === 'day') slot = point.time.hour + point.time.minute / 60;
    if (isPrevious && range === 'month') slot = point.time.day - 1 + point.time.hour / 24;
    if (isPrevious && range === 'year') {
      const daysInMonth = new Date(Date.UTC(point.time.year, point.time.month, 0)).getUTCDate();
      slot = (point.time.month - 1) + (point.time.day - 1) / daysInMonth;
    }
    if (slot < 0 || (range === 'day' && slot > 24) || (range === 'week' && slot > 168) || (range === 'month' && slot > 32) || (range === 'year' && slot > 12)) continue;
    const key = Math.round(slot * 4) / 4;
    const row = rows.get(key) ?? { slot: key, currentKw: null, previousKw: null };
    const durationHours = typeof intervalHours === 'function' ? intervalHours(point) : intervalHours;
    const kw = point.kwh / durationHours;
    if (isPrevious) row.previousKw = (row.previousKw ?? 0) + kw;
    else row.currentKw = (row.currentKw ?? 0) + kw;
    rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => left.slot - right.slot);
}

async function getAccessToken(integration: Record<string, unknown>) {
  const expiresAt = typeof integration.token_expires_at === 'string' ? Date.parse(integration.token_expires_at) : 0;
  if (typeof integration.access_token_encrypted === 'string' && expiresAt > Date.now() + 60_000) {
    return decryptSolarSecret(integration.access_token_encrypted);
  }

  if (typeof integration.refresh_token_encrypted !== 'string' || typeof integration.client_secret_encrypted !== 'string' || typeof integration.client_id !== 'string') {
    throw new Error('SolarEdge authorization needs to be reconnected.');
  }
  const currentRefreshToken = decryptSolarSecret(integration.refresh_token_encrypted);
  const response = await fetch(SOLAREDGE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: integration.client_id,
      client_secret: decryptSolarSecret(integration.client_secret_encrypted),
    }),
    cache: 'no-store',
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || typeof token.access_token !== 'string') {
    throw new Error('SolarEdge authorization needs to be reconnected.');
  }

  const accessToken = token.access_token as string;
  const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token : currentRefreshToken;
  const expiresIn = Number(token.expires_in) || 7200;
  const expires = new Date(Date.now() + expiresIn * 1000).toISOString();
  const { error } = await supabaseAdmin!.from('property_solar_integrations').update({
    access_token_encrypted: encryptSolarSecret(accessToken),
    refresh_token_encrypted: encryptSolarSecret(refreshToken),
    token_expires_at: expires,
    updated_at: new Date().toISOString(),
  }).eq('property_id', integration.property_id);
  if (error) throw error;
  return accessToken;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ properties: [] });

    const requestedPropertyId = request.nextUrl.searchParams.get('propertyId');
    const chartDate = request.nextUrl.searchParams.get('date');
    const chartRange = request.nextUrl.searchParams.get('range') ?? 'day';
    if (chartDate && (!/^\d{4}-\d{2}-\d{2}$/.test(chartDate) || !Number.isFinite(Date.parse(`${chartDate}T00:00:00Z`)) || new Date(`${chartDate}T00:00:00Z`).toISOString().slice(0, 10) !== chartDate || chartDate > solarToday() || !['day', 'week', 'month', 'year'].includes(chartRange))) {
      return NextResponse.json({ error: 'Choose a valid date on or before today and a supported range.' }, { status: 400 });
    }
    let tenantPropertyId: string | null = null;
    if (user.role === 'tenant') {
      const { data: tenant, error: tenantError } = await supabaseAdmin.from('tenants')
        .select('unit_id').ilike('email', user.email).eq('status', 'active').limit(1).maybeSingle();
      if (tenantError) throw tenantError;
      if (tenant?.unit_id) {
        const { data: unit, error: unitError } = await supabaseAdmin.from('units')
          .select('property_id').eq('id', tenant.unit_id).maybeSingle();
        if (unitError) throw unitError;
        tenantPropertyId = unit?.property_id ?? null;
      }
      if (!tenantPropertyId) return NextResponse.json({ properties: [] });
      if (requestedPropertyId && requestedPropertyId !== tenantPropertyId) {
        return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
      }
    }

    let propertiesQuery = supabaseAdmin.from('properties').select('id, name, latitude, longitude')
      .eq('organization_id', organizationId).order('name');
    const propertyFilter = tenantPropertyId ?? requestedPropertyId;
    if (propertyFilter) propertiesQuery = propertiesQuery.eq('id', propertyFilter);
    const { data: properties, error: propertiesError } = await propertiesQuery;
    if (propertiesError) throw propertiesError;
    const propertyIds = (properties ?? []).map((property) => property.id);
    if (!propertyIds.length) return NextResponse.json({ properties: [] });

    const { data: integrations, error: integrationsError } = await supabaseAdmin.from('property_solar_integrations')
      .select('property_id, enabled, site_id, client_id, client_secret_encrypted, access_token_encrypted, refresh_token_encrypted, token_expires_at')
      .eq('enabled', true).in('property_id', propertyIds);
    if (integrationsError) throw integrationsError;

    const propertyMap = new Map((properties ?? []).map((property) => [property.id, property]));
    const solarProperties = await Promise.all((integrations ?? []).map(async (integration) => {
      const property = propertyMap.get(integration.property_id);
      if (!property) return null;
      if (!integration.site_id || !integration.access_token_encrypted) {
        return { id: property.id, name: property.name, latitude: property.latitude, longitude: property.longitude, siteId: integration.site_id, status: 'not_connected' };
      }
      try {
        const accessToken = await getAccessToken(integration as unknown as Record<string, unknown>);
        const now = getLocalTime(new Date());
        if (chartDate) {
          const window = solarWindow(chartDate, chartRange as SolarRange);
          const from = parsePointTime(window.start)!;
          const fullEnd = parsePointTime(window.end)!;
          const to = localOrdinal(fullEnd) > localOrdinal(now) ? now : fullEnd;
          const previousFrom = parsePointTime(window.previousStart)!;
          const previousTo = chartRange === 'month' ? shiftLocalMonths(to, -1) : chartRange === 'year' ? shiftLocalMonths(to, -12) : shiftLocalDays(to, chartRange === 'week' ? -7 : -1);
          const resolution = chartRange === 'day' ? 'QUARTER_HOUR' : chartRange === 'year' ? 'MONTH' : 'DAY';
          const [currentPayload, previousPayload] = await Promise.all([
            getSolarJson(integration.site_id, accessToken, from, to, resolution),
            getSolarJson(integration.site_id, accessToken, previousFrom, previousTo, resolution),
          ]);
          const points = [...energyPoints(currentPayload), ...energyPoints(previousPayload)];
          const intervalHours = chartRange === 'day' ? 0.25 : chartRange === 'year'
            ? (point: EnergyPoint) => new Date(Date.UTC(point.time.year, point.time.month, 0)).getUTCDate() * 24
            : 24;
          return { id: property.id, status: 'connected', charts: { [chartRange]: pointsToChart(points, from, to, previousFrom, previousTo, chartRange, intervalHours) } };
        }
        const today = { ...now, hour: 0, minute: 0, second: 0 };
        const yesterday = shiftLocalDays(today, -1);
        const dayBeforeYesterday = shiftLocalDays(today, -2);
        const weekDay = new Date(Date.UTC(now.year, now.month - 1, now.day)).getUTCDay();
        const mondayOffset = (weekDay + 6) % 7;
        const weekStart = shiftLocalDays(today, -mondayOffset);
        const previousWeek = shiftLocalDays(weekStart, -7);
        const monthStart = { ...now, day: 1, hour: 0, minute: 0, second: 0 };
        const previousMonth = shiftLocalMonths(monthStart, -1);
        const yearStart = { ...now, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
        const previousYear = { ...yearStart, year: yearStart.year - 1 };
        const yesterdaySameTime = shiftLocalDays(now, -1);
        const weekSameTime = shiftLocalDays(now, -7);
        const monthSameTime = shiftLocalMonths(now, -1);
        const yearSameTime = { ...now, year: now.month === 2 && now.day === 29 ? now.year - 1 : now.year - 1, day: now.month === 2 && now.day === 29 ? 28 : now.day };

        const [dayPayload, weekPayload, monthCurrentPayload, monthPreviousPayload, yearCurrentPayload, yearPreviousPayload, reportingInverterCount] = await Promise.all([
          getSolarJson(integration.site_id, accessToken, dayBeforeYesterday, now, 'QUARTER_HOUR'),
          getSolarJson(integration.site_id, accessToken, previousWeek, now, 'DAY'),
          getSolarJson(integration.site_id, accessToken, monthStart, now, 'DAY'),
          getSolarJson(integration.site_id, accessToken, previousMonth, monthSameTime, 'DAY'),
          getSolarJson(integration.site_id, accessToken, yearStart, now, 'MONTH'),
          getSolarJson(integration.site_id, accessToken, previousYear, yearSameTime, 'MONTH'),
          getReportingInverterCount(integration.site_id, accessToken).catch(() => null),
        ]);

        const dayPoints = energyPoints(dayPayload);
        const weekPoints = energyPoints(weekPayload);
        const monthCurrentPoints = energyPoints(monthCurrentPayload);
        const monthPreviousPoints = energyPoints(monthPreviousPayload);
        const monthPoints = [...monthCurrentPoints, ...monthPreviousPoints];
        const yearCurrentPoints = energyPoints(yearCurrentPayload);
        const yearPreviousPoints = energyPoints(yearPreviousPayload);
        const yearPoints = [...yearCurrentPoints, ...yearPreviousPoints];
        const dayMetric = comparison(dayPoints, today, now, yesterday, yesterdaySameTime, dayPoints);
        const weekMetric = comparison(weekPoints, weekStart, now, previousWeek, weekSameTime, weekPoints);
        const monthMetric = comparison(monthPoints, monthStart, now, previousMonth, monthSameTime);
        const yearMetric = comparison(yearPoints, yearStart, now, previousYear, yearSameTime);
        const yesterdayMetric = comparison(dayPoints, yesterday, yesterdaySameTime, shiftLocalDays(yesterday, -1), shiftLocalDays(yesterdaySameTime, -1), dayPoints);
        const periods: Record<string, PeriodComparison> = {
          today: dayMetric,
          yesterday: yesterdayMetric,
          week: weekMetric,
          month: monthMetric,
          year: yearMetric,
        };

        const livePowerReadings = dayPoints.flatMap((point) => {
          return [{ kw: point.kwh / 0.25, time: point.time }];
        });
        const todayPowerReadings = livePowerReadings.filter((reading) => localOrdinal(reading.time) >= localOrdinal(today) && localOrdinal(reading.time) < localOrdinal(now));
        const currentKw = livePowerReadings.length ? livePowerReadings[livePowerReadings.length - 1].kw : 0;
        const maxKwToday = todayPowerReadings.reduce((maximum, reading) => Math.max(maximum, reading.kw), 0);

        const charts = {
          day: pointsToChart(dayPoints, today, now, yesterday, yesterdaySameTime, 'day', 0.25),
          week: pointsToChart(weekPoints, weekStart, now, previousWeek, weekSameTime, 'week', 24),
          month: pointsToChart(monthPoints, monthStart, now, previousMonth, monthSameTime, 'month', 24),
          year: pointsToChart(yearPoints, yearStart, now, previousYear, yearSameTime, 'year', (point) => new Date(Date.UTC(point.time.year, point.time.month, 0)).getUTCDate() * 24),
        };

        return {
          id: property.id,
          name: property.name,
          latitude: property.latitude,
          longitude: property.longitude,
          siteId: integration.site_id,
          status: 'connected',
          currentKw,
          maxKwToday,
          reportingInverterCount,
          periods,
          charts,
          blendedRate: BLENDED_DAYTIME_RATE,
          rateNote: 'Approximate SDG&E avoided-cost estimate using illustrative time-of-use rates (42¢/kWh daytime, 58¢/kWh 4-9 PM, 33¢/kWh overnight; longer-period summaries use a 44¢/kWh blend). Actual tariff and NEM export credits vary; this is not a bill calculation.',
        };
      } catch (error) {
        console.error(`SolarEdge data load failed for property ${property.id}:`, error instanceof Error ? error.message : 'Unknown error', error instanceof SolarEdgeHttpError ? error.providerMessage : '');
        if (error instanceof SolarEdgeHttpError && error.status === 429) {
          return { id: property.id, name: property.name, latitude: property.latitude, longitude: property.longitude, siteId: integration.site_id, status: 'rate_limited', retryAfter: error.retryAfter };
        }
        if (error instanceof SolarEdgeHttpError && (error.status === 401 || error.status === 403)) {
          return { id: property.id, name: property.name, latitude: property.latitude, longitude: property.longitude, siteId: integration.site_id, status: 'reauthorize', providerStatus: error.status };
        }
        if (error instanceof SolarEdgeHttpError) {
          return { id: property.id, name: property.name, latitude: property.latitude, longitude: property.longitude, siteId: integration.site_id, status: 'api_error', providerStatus: error.status, providerMessage: error.providerMessage };
        }
        return { id: property.id, name: property.name, siteId: integration.site_id, status: 'error' };
      }
    }));

    return NextResponse.json({ properties: solarProperties.filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET SolarEdge data failed:', error);
    return NextResponse.json({ error: 'Solar power data could not be loaded.' }, { status: 500 });
  }
}