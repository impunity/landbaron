'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getRoleLabel, getUserRoleByEmail, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type TenantWithUnit = {
  id: string;
  unit_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  status: string;
  emergency_contact?: string | null;
  notes?: string | null;
  created_at: string;
  units?: {
    id: string;
    unit_number: string;
    property_id: string;
    properties?: {
      id: string;
      name: string;
      address: string;
    };
  };
};

export default function TenantsPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [tenants, setTenants] = useState<TenantWithUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past' | 'pending'>('all');

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

      const role = getUserRoleByEmail(sessionUser.email);
      if (role === 'tenant') {
        router.replace('/dashboard');
        return;
      }

      setSessionState({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
      });
    };

    syncSession();

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser) {
        setSessionState(null);
        router.replace('/login');
        return;
      }

      const role = getUserRoleByEmail(nextUser.email);
      if (role === 'tenant') {
        router.replace('/dashboard');
        return;
      }

      setSessionState({
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'User',
        email: nextUser.email || '',
        role,
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const loadTenants = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/tenants', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to load tenants.');
      }

      setTenants(Array.isArray(result.tenants) ? result.tenants : []);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load tenants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && session.role !== 'tenant') {
      void loadTenants();
    }
  }, [session]);

  const filteredTenants = useMemo(() => {
    let list = tenants;
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }

    const query = searchTerm.toLowerCase().trim();
    if (!query) return list;

    return list.filter((t) => {
      const nameMatch = t.name.toLowerCase().includes(query);
      const emailMatch = (t.email ?? '').toLowerCase().includes(query);
      const phoneMatch = (t.phone ?? '').toLowerCase().includes(query);
      const propMatch = (t.units?.properties?.name ?? '').toLowerCase().includes(query);
      const addrMatch = (t.units?.properties?.address ?? '').toLowerCase().includes(query);
      const unitMatch = (t.units?.unit_number ?? '').toLowerCase().includes(query);
      return nameMatch || emailMatch || phoneMatch || propMatch || addrMatch || unitMatch;
    });
  }, [tenants, searchTerm, statusFilter]);

  if (!session) return null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800"
              >
                Dashboard
              </button>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                Tenants
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Tenants Directory
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/properties')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Properties & Units
            </button>
            {session.role === 'owner' && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/staff')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Staff roster
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder="Search by tenant name, email, phone, property, or unit..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-slate-500"
          />

          <div className="flex gap-2">
            {[
              { key: 'all' as const, label: 'All' },
              { key: 'active' as const, label: 'Active' },
              { key: 'pending' as const, label: 'Pending' },
              { key: 'past' as const, label: 'Past' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading tenants...
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <h3 className="text-base font-semibold text-slate-900">No tenants found</h3>
            <p className="mt-2 text-sm text-slate-500">
              {searchTerm
                ? 'Try adjusting your search terms.'
                : 'Tenants will appear here once added to a unit in Properties.'}
            </p>
            <button
              type="button"
              onClick={() => router.push('/dashboard/properties')}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              View Properties & Units
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Tenant Name</th>
                  <th className="px-5 py-3.5">Property & Unit</th>
                  <th className="px-5 py-3.5">Contact Details</th>
                  <th className="px-5 py-3.5">Lease Period</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTenants.map((t) => {
                  const unitPropId = t.units?.property_id;
                  const unitId = t.units?.id;

                  return (
                    <tr key={t.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {t.name}
                        {t.notes && <p className="text-xs font-normal text-slate-500 italic mt-0.5">{t.notes}</p>}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {t.units ? (
                          <div>
                            <p className="font-medium text-slate-900">
                              Unit {t.units.unit_number}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t.units.properties?.name || t.units.properties?.address}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned unit</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {t.email && (
                          <p>
                            <a href={`mailto:${t.email}`} className="text-slate-900 underline">
                              {t.email}
                            </a>
                          </p>
                        )}
                        {t.phone && (
                          <p className="mt-0.5">
                            <a href={`tel:${t.phone}`} className="text-slate-900 underline">
                              {t.phone}
                            </a>
                          </p>
                        )}
                        {t.emergency_contact && (
                          <p className="text-slate-400 mt-1">Emergency: {t.emergency_contact}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {t.lease_start || t.lease_end ? (
                          <span>
                            {t.lease_start ?? 'N/A'} → {t.lease_end ?? 'Present'}
                          </span>
                        ) : (
                          <span className="text-slate-400">No dates recorded</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            t.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {unitPropId && unitId ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/dashboard/properties/${unitPropId}/units/${unitId}`)
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View unit →
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
