'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type UnitSummary = {
  id: string;
  unit_number: string;
  rent_amount?: number | null;
  status?: string | null;
  unit_photos?: Array<{ id: string; photo_url: string; is_primary?: boolean | null }>;
};

type Property = {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  units?: UnitSummary[];
};

// California AB 1482 caps annual increases at 5% + local CPI, up to a 10% ceiling.
// We default to that statewide ceiling and let the owner/manager dial it down per their local CPI.
const DEFAULT_MAX_INCREASE_PERCENT = 10;

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const getUnitThumbnail = (unit: UnitSummary) => {
  const sorted = [...(unit.unit_photos ?? [])].sort(
    (a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)),
  );
  return sorted[0]?.photo_url ?? null;
};

const getUnitAddress = (property: Property, unit: UnitSummary) =>
  `Unit ${unit.unit_number} \u2014 ${property.address}${property.city ? `, ${property.city}` : ''}`;

export default function RentIncreaseAnalysisPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [maxIncreasePercent, setMaxIncreasePercent] = useState(DEFAULT_MAX_INCREASE_PERCENT);
  const [percentByUnit, setPercentByUnit] = useState<Record<string, number>>({});

  useEffect(() => {
    const client = supabase;

    if (!client) {
      setError('Supabase is not configured for this environment yet.');
      setLoading(false);
      return;
    }

    const syncSession = async () => {
      const { data } = await client.auth.getSession();
      const sessionUser = data.session?.user;

      if (!sessionUser) {
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(sessionUser.email, client);
      const nextSession: SessionUser = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
      };

      setSession(nextSession);
      if (nextSession.role !== 'owner' && nextSession.role !== 'manager') {
        router.replace('/dashboard');
      }
    };

    void syncSession();

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;

      if (!nextUser) {
        setSession(null);
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(nextUser.email, client);
      const nextSessionUser: SessionUser = {
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'User',
        email: nextUser.email || '',
        role,
      };

      setSession(nextSessionUser);
      if (nextSessionUser.role !== 'owner' && nextSessionUser.role !== 'manager') {
        router.replace('/dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
      return;
    }

    const loadProperties = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
        const accessToken = authData.session?.access_token;

        if (!accessToken) {
          throw new Error('Sign in is required.');
        }

        const response = await fetch('/api/properties', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.error || 'Unable to load properties.');
        }

        setProperties(Array.isArray(result.properties) ? result.properties : []);
      } catch (loadError) {
        console.error(loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load properties.');
      } finally {
        setLoading(false);
      }
    };

    void loadProperties();
  }, [session]);

  const filteredProperties = useMemo(() => {
    if (propertyFilter === 'all') {
      return properties;
    }
    return properties.filter((property) => property.id === propertyFilter);
  }, [properties, propertyFilter]);

  const getUnitPercent = (unitId: string) => percentByUnit[unitId] ?? 0;

  const handlePercentChange = (unitId: string, value: number) => {
    setPercentByUnit((current) => ({ ...current, [unitId]: value }));
  };

  const getPotentialRent = (unit: UnitSummary) => {
    const currentRent = unit.rent_amount ?? 0;
    const percent = getUnitPercent(unit.id);
    return currentRent * (1 + percent / 100);
  };

  const propertySubtotals = useMemo(() => {
    return filteredProperties.map((property) => {
      const units = property.units ?? [];
      const currentTotal = units.reduce((sum, unit) => sum + (unit.rent_amount ?? 0), 0);
      const potentialTotal = units.reduce((sum, unit) => sum + getPotentialRent(unit), 0);
      return { propertyId: property.id, currentTotal, potentialTotal };
    });
  }, [filteredProperties, percentByUnit]);

  const grandTotals = useMemo(
    () =>
      propertySubtotals.reduce(
        (totals, subtotal) => ({
          currentTotal: totals.currentTotal + subtotal.currentTotal,
          potentialTotal: totals.potentialTotal + subtotal.potentialTotal,
        }),
        { currentTotal: 0, potentialTotal: 0 },
      ),
    [propertySubtotals],
  );

  if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard/analysis')}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800"
              >
                Analysis
              </button>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                Rent Increase Analysis
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Rent Increase Analysis</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              California&apos;s AB 1482 caps most annual increases at 5% plus local CPI, up to a 10% ceiling. Adjust the
              max slider below if your local cap is lower.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Maintenance Tickets
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/vendors')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Approved Vendors
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/properties')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Properties & Units
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/tenants')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Tenants
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/staff')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Staff roster
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Property
            <select
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
            >
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name || property.address}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Max allowed increase (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={maxIncreasePercent}
              onChange={(event) => setMaxIncreasePercent(Math.max(0, Number(event.target.value) || 0))}
              className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
            />
          </label>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading properties...
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            No properties found.
          </div>
        ) : (
          <div className="space-y-6">
            {filteredProperties.map((property, propertyIndex) => {
              const units = property.units ?? [];
              const subtotal = propertySubtotals[propertyIndex];

              return (
                <section key={property.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{property.name || property.address}</h2>
                      <p className="text-sm text-slate-500">{property.address}</p>
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      <p>Current: <span className="font-semibold text-slate-900">{formatCurrency(subtotal?.currentTotal ?? 0)}</span></p>
                      <p>Potential: <span className="font-semibold text-emerald-700">{formatCurrency(subtotal?.potentialTotal ?? 0)}</span></p>
                    </div>
                  </div>

                  {units.length === 0 ? (
                    <p className="p-5 text-sm text-slate-500">No units on this property yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {units.map((unit) => {
                        const thumbnail = getUnitThumbnail(unit);
                        const currentRent = unit.rent_amount ?? 0;
                        const percent = getUnitPercent(unit.id);
                        const potentialRent = getPotentialRent(unit);
                        const hasRent = Boolean(unit.rent_amount);

                        return (
                          <div key={unit.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                              {thumbnail ? (
                                <img src={thumbnail} alt={`Unit ${unit.unit_number}`} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">No photo</div>
                              )}
                            </div>

                            <div className="min-w-[200px] flex-1">
                              <p className="font-medium text-slate-900">{getUnitAddress(property, unit)}</p>
                              <p className="text-xs text-slate-500">Current rent: {hasRent ? formatCurrency(currentRent) : 'Not set'}</p>
                            </div>

                            <div className="flex flex-1 items-center gap-3">
                              <input
                                type="range"
                                min={0}
                                max={maxIncreasePercent}
                                step={0.1}
                                value={Math.min(percent, maxIncreasePercent)}
                                disabled={!hasRent}
                                onChange={(event) => handlePercentChange(unit.id, Number(event.target.value))}
                                className="w-full disabled:opacity-40"
                              />
                              <span className="w-16 shrink-0 text-right text-sm font-medium text-slate-700">
                                {percent.toFixed(1)}%
                              </span>
                            </div>

                            <div className="min-w-[140px] text-right">
                              <p className="text-xs uppercase tracking-wider text-slate-500">Potential New Rent</p>
                              <p className="text-lg font-semibold text-emerald-700">
                                {hasRent ? formatCurrency(potentialRent) : '\u2014'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            <div className="flex flex-wrap items-center justify-end gap-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-slate-500">Current Total Rents</p>
                <p className="text-2xl font-semibold text-slate-900">{formatCurrency(grandTotals.currentTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-slate-500">Potential New Total Rents</p>
                <p className="text-2xl font-semibold text-emerald-700">{formatCurrency(grandTotals.potentialTotal)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
