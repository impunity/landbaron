'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';

import { fetchUserRole, type UserRole } from '@/lib/auth';
import { formatCurrency } from '@/lib/format-currency';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

type ChartRange = 'day' | 'week' | 'month' | 'year';
type ChartPoint = { slot: number; currentKw: number | null; previousKw: number | null };
type PeriodTotal = { kwh: number; value: number };
type PeriodComparison = PeriodTotal & { previousKwh: number; previousValue: number };
type SolarProperty = {
  id: string;
  name: string;
  siteId: string | null;
  status: 'connected' | 'not_connected' | 'error' | 'rate_limited' | 'reauthorize' | 'api_error';
  retryAfter?: string | null;
  providerStatus?: number;
  providerMessage?: string | null;
  currentKw?: number;
  periods?: Record<'today' | 'yesterday' | 'week' | 'month' | 'year', PeriodComparison>;
  charts?: Record<ChartRange, ChartPoint[]>;
  blendedRate?: number;
  rateNote?: string;
};

const rangeOptions: Array<{ key: ChartRange; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const periodOptions: Array<{ key: keyof NonNullable<SolarProperty['periods']>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

const connectionFailureMessages: Record<string, string> = {
  'server-not-configured': 'SolarEdge server configuration is incomplete.',
  'state-missing': 'The authorization response did not include OAuth state. Restart the connection from Settings.',
  'state-mismatch': 'The authorization state did not match this browser session. Restart the connection from Settings.',
  'state-lookup-failed': 'The authorization state could not be checked. Try connecting again.',
  'state-expired-or-unknown': 'The authorization request expired or was already used. Restart the connection from Settings.',
  'authorization-denied': 'SolarEdge authorization was denied or canceled.',
  'authorization-code-missing': 'SolarEdge did not return an authorization code. Check the registered redirect URL.',
  'credentials-lookup-failed': 'Saved SolarEdge credentials could not be loaded.',
  'credentials-not-saved': 'Save the SolarEdge Client ID and Client Secret in Settings before connecting.',
  'credential-decryption-failed': 'The saved Client Secret could not be decrypted. Verify SOLAREDGE_ENCRYPTION_KEY matches the key used when it was saved.',
  'token-exchange-failed': 'The app could not reach SolarEdge to exchange the authorization code.',
  'token-exchange-rejected': 'SolarEdge rejected the Client ID, Client Secret, or registered redirect URL. Verify them in SolarEdge and Settings.',
  'token-response-incomplete': 'SolarEdge returned an incomplete authorization response. Reconnect or check the app scopes.',
  'site-id-missing': 'SolarEdge did not return a Site ID. Confirm the authorized account has access to a site.',
  'token-storage-failed': 'SolarEdge connected, but tokens could not be saved. Check server encryption and database setup.',
  'callback-error': 'The callback encountered a server error. Try connecting again or check server logs.',
};

const formatEnergy = (value: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} kWh`;
const formatPower = (value: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} kW`;

function formatSlot(value: number, range: ChartRange) {
  if (range === 'day') {
    const hour = Math.floor(value) % 24;
    return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
  }
  if (range === 'week') {
    const day = Math.floor(value / 24);
    const hour = Math.floor(value % 24);
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day] ?? '';
    return hour === 0 ? weekday : `${weekday} ${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
  }
  if (range === 'month') return `${Math.floor(value) + 1}`;
  const month = Math.min(11, Math.floor(value));
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month];
}

function getChartTicks(range: ChartRange, maximum: number) {
  const step = range === 'day' ? 6 : range === 'week' ? 24 : range === 'month' ? 7 : 1;
  const ticks = [0];
  for (let value = step; value < maximum; value += step) ticks.push(value);
  if (maximum > 0) ticks.push(maximum);
  return [...new Set(ticks)];
}

function PeriodCard({ label, period }: { label: string; period: PeriodComparison }) {
  const difference = period.kwh - period.previousKwh;
  const percentage = period.previousKwh > 0 ? (difference / period.previousKwh) * 100 : null;
  const isUp = difference > 0.01;
  const isDown = difference < -0.01;
  const TrendIcon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const trendColor = isUp ? 'text-emerald-700' : isDown ? 'text-rose-700' : 'text-slate-500';

  return (
    <article className="min-w-0 border border-slate-200 bg-white p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
      <p className="mt-2 text-xl font-semibold tabular-nums text-slate-950">{formatEnergy(period.kwh)}</p>
      <p className="mt-1 text-sm font-medium text-teal-800">≈ {formatCurrency(period.value)}</p>
      <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
        <TrendIcon size={15} aria-hidden="true" />
        <span>{percentage === null ? (isUp ? 'New production' : 'No prior data') : `${Math.abs(percentage).toFixed(1)}% vs prior`}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Prior: {formatEnergy(period.previousKwh)}</p>
    </article>
  );
}

async function fetchSolarProperties(accessToken: string, propertyId?: string): Promise<SolarProperty[]> {
  const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
  const response = await fetch(`/api/solar-power${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Solar power data could not be loaded.');
  return result.properties ?? [];
}

export default function SolarPowerPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState<SolarProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>('day');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const client = supabase;
        const session = (await client?.auth.getSession())?.data.session;
        if (!session) {
          router.replace('/login');
          return;
        }
        setRole(await fetchUserRole(session.user.email, client));
        const requestedPropertyId = new URLSearchParams(window.location.search).get('propertyId') ?? '';
        setPropertyId(requestedPropertyId);
        const connection = new URLSearchParams(window.location.search).get('connection');
        if (connection === 'connected') setNotice('SolarEdge connected successfully.');
        if (connection === 'failed') {
          const reason = new URLSearchParams(window.location.search).get('connectionReason') ?? '';
          setError(`SolarEdge connection failed: ${connectionFailureMessages[reason] ?? 'Check credentials and registered callback URL in Settings.'}`);
        }
        setProperties(await fetchSolarProperties(session.access_token, requestedPropertyId || undefined));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Solar power data could not be loaded.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const accessToken = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!accessToken) throw new Error('Sign in is required.');
      setProperties(await fetchSolarProperties(accessToken, propertyId || undefined));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Solar power data could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Solar Power', href: '/dashboard/solar-power' }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Solar Power</h1><p className="mt-1 text-sm text-slate-600">Production and estimated energy value</p></div><button type="button" onClick={() => void refresh()} disabled={loading || refreshing} title="Refresh SolarEdge data" aria-label="Refresh SolarEdge data" className="inline-flex size-9 items-center justify-center border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button></div>
        {role && <div className="mt-4 flex flex-wrap gap-2"><DashboardNavButtons current="solar-power" role={role} /></div>}
        {notice && <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <p className="mt-6 text-sm text-slate-500">Loading solar sites...</p> : properties.length === 0 ? (
          <p className="mt-6 border-t border-slate-300 bg-white px-5 py-6 text-sm text-slate-600">No properties are currently enabled for solar power.</p>
        ) : <div className="mt-6 divide-y divide-slate-300 border-y border-slate-300 bg-white px-5 sm:px-6">
          {properties.map((property) => <article key={property.id} className="py-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{property.name}</h2>{property.siteId && <p className="text-xs text-slate-500">SolarEdge site {property.siteId}</p>}</div>{property.status === 'connected' ? <p className="text-xs font-medium text-emerald-700">Connected</p> : property.status === 'rate_limited' ? <p role="status" className="text-sm font-medium text-amber-800">SolarEdge is rate-limiting requests; wait briefly, then refresh.</p> : property.status === 'reauthorize' ? <a href="/dashboard/settings" className="text-sm font-medium text-teal-800 underline">Authorization expired or missing scopes · Reconnect in Settings</a> : property.status === 'api_error' ? <div role="alert" className="max-w-2xl text-sm text-rose-700"><p>SolarEdge data request failed (HTTP {property.providerStatus}).</p>{property.providerMessage && <p className="mt-1 text-xs text-rose-800">{property.providerMessage}</p>}</div> : <a href="/dashboard/settings" className="text-sm font-medium text-teal-800 underline">{property.status === 'not_connected' ? 'Complete setup in Settings' : 'Check SolarEdge setup in Settings'}</a>}</div>
            {property.status === 'connected' && property.periods && property.charts && <>
              <section className="mt-5 border-t border-slate-200 pt-4" aria-label={`${property.name} production summary`}>
                <p className="text-xs font-semibold uppercase text-slate-500">Latest reported production · 15-minute sample</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-800">{formatPower(property.currentKw ?? 0)}</p>
              </section>
              <section className="mt-5" aria-label={`${property.name} energy production comparisons`}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {periodOptions.map((period) => <PeriodCard key={period.key} label={period.label} period={property.periods![period.key]} />)}
                </div>
              </section>
              <section className="mt-6 border-t border-slate-200 pt-5" aria-label={`${property.name} power history chart`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="font-semibold">Production over time</h3><p className="mt-1 text-xs text-slate-500">{chartRange === 'day' ? '15-minute samples' : 'Daily average'} · current period vs previous matching period</p></div>
                  <div className="inline-flex border border-slate-300" role="group" aria-label="Chart time range">
                    {rangeOptions.map((option) => <button key={option.key} type="button" aria-pressed={chartRange === option.key} onClick={() => setChartRange(option.key)} className={`px-3 py-1.5 text-sm font-medium ${chartRange === option.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{option.label}</button>)}
                  </div>
                </div>
                <div className="mt-4 h-72 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={property.charts[chartRange]} margin={{ top: 8, right: 14, left: 2, bottom: 4 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="slot" type="number" scale="linear" domain={[0, 'dataMax']} ticks={getChartTicks(chartRange, Math.max(...property.charts[chartRange].map((point) => point.slot), 1))} tickFormatter={(value) => formatSlot(Number(value), chartRange)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                      <YAxis width={62} tickFormatter={(value) => `${Number(value).toFixed(1)} kW`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip labelFormatter={(value) => formatSlot(Number(value), chartRange)} formatter={(value, name) => [`${Number(value ?? 0).toFixed(2)} kW`, name === 'currentKw' ? 'Current' : 'Previous']} contentStyle={{ borderRadius: 4, borderColor: '#cbd5e1', fontSize: 12 }} />
                      <Legend formatter={(value) => value === 'currentKw' ? 'Current period' : 'Previous period'} wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="previousKw" name="previousKw" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.2} strokeWidth={1.5} connectNulls={false} />
                      <Area type="monotone" dataKey="currentKw" name="currentKw" stroke="#047857" fill="#34d399" fillOpacity={0.18} strokeWidth={2} connectNulls={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">{property.rateNote ?? `Estimated avoided energy value uses an approximate SDG&E daytime blended rate of ${formatCurrency(property.blendedRate ?? 0.44)}/kWh. Actual value depends on your tariff and self-consumption; this is not an NEM export-credit or bill calculation.`}</p>
            </>}
          </article>)}
        </div>}
      </div>
    </main>
  );
}