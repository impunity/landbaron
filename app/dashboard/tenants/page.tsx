'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';


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

type TenantSortKey = 'name' | 'property' | 'contact' | 'lease' | 'status';
type SortDirection = 'asc' | 'desc';

const getTenantNameParts = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: '', lastName: '', displayName: '' };
  }

  if (trimmed.includes(',')) {
    const [lastName, ...firstParts] = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    const firstName = firstParts.join(', ');
    return { firstName, lastName, displayName: [lastName, firstName].filter(Boolean).join(', ') };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: '', lastName: parts[0], displayName: parts[0] };
  }

  const lastName = parts.at(-1) ?? '';
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName, displayName: `${lastName}, ${firstName}` };
};

const getTenantNameSortValue = (tenant: TenantWithUnit) => {
  const { firstName, lastName } = getTenantNameParts(tenant.name);
  return [lastName, firstName].filter(Boolean).join(' ');
};

const formatTenantName = (name: string) => getTenantNameParts(name).displayName || name;

const getTenantPropertyLabel = (tenant: TenantWithUnit) => [
  tenant.units?.properties?.name ?? tenant.units?.properties?.address ?? '',
  tenant.units?.unit_number ? `Unit ${tenant.units.unit_number}` : '',
].filter(Boolean).join(' ');

const getTenantContactLabel = (tenant: TenantWithUnit) => tenant.email || tenant.phone || tenant.emergency_contact || '';

const getTenantLeaseSortValue = (tenant: TenantWithUnit) => {
  const value = tenant.lease_start || tenant.lease_end;
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
};

const compareText = (first: string, second: string) => first.localeCompare(second, undefined, { sensitivity: 'base' });

export default function TenantsPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [tenants, setTenants] = useState<TenantWithUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past' | 'pending'>('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [tenantSort, setTenantSort] = useState<{ key: TenantSortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });

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

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser) {
        setSessionState(null);
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(nextUser.email, client);
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
    if (propertyFilter !== 'all') {
      list = list.filter((tenant) => tenant.units?.property_id === propertyFilter);
    }
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
  }, [tenants, searchTerm, statusFilter, propertyFilter]);

  const sortedTenants = useMemo(() => {
    const next = [...filteredTenants];

    next.sort((first, second) => {
      let result = 0;

      if (tenantSort.key === 'name') {
        result = compareText(getTenantNameSortValue(first), getTenantNameSortValue(second));
      } else if (tenantSort.key === 'property') {
        result = compareText(getTenantPropertyLabel(first), getTenantPropertyLabel(second));
      } else if (tenantSort.key === 'contact') {
        result = compareText(getTenantContactLabel(first), getTenantContactLabel(second));
      } else if (tenantSort.key === 'lease') {
        result = getTenantLeaseSortValue(first) - getTenantLeaseSortValue(second);
      } else if (tenantSort.key === 'status') {
        result = compareText(first.status, second.status);
      }

      if (result === 0) {
        result = compareText(getTenantNameSortValue(first), getTenantNameSortValue(second));
      }

      return tenantSort.direction === 'asc' ? result : -result;
    });

    return next;
  }, [filteredTenants, tenantSort]);

  const propertyOptions = useMemo(() => {
    const properties = new Map<string, string>();
    tenants.forEach((tenant) => {
      const property = tenant.units?.properties;
      if (property?.id) properties.set(property.id, property.name || property.address);
    });
    return Array.from(properties.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tenants]);

  const handleSortChange = (key: TenantSortKey) => {
    setTenantSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const renderSortHeader = (key: TenantSortKey, label: string) => {
    const isActive = tenantSort.key === key;

    return (
      <th className="px-5 py-3.5">
        <button
          type="button"
          onClick={() => handleSortChange(key)}
          className="flex items-center gap-1 text-left font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-900"
        >
          <span>{label}</span>
          <span aria-hidden="true" className="text-[10px] text-slate-400">
            {isActive ? (tenantSort.direction === 'asc' ? 'A-Z' : 'Z-A') : 'Sort'}
          </span>
        </button>
      </th>
    );
  };

  if (!session) return null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tenants', href: '/dashboard/tenants' }]} />
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Tenants Directory
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DashboardNavButtons current="tenants" role={session.role} />
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:flex-row">
            <input
              type="text"
              placeholder="Search tenants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-slate-500"
            />
            <select
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
            >
              <option value="all">All properties</option>
              {propertyOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

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
        ) : sortedTenants.length === 0 ? (
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
                  {renderSortHeader('name', 'Tenant Name')}
                  {renderSortHeader('property', 'Property & Unit')}
                  {renderSortHeader('contact', 'Contact Details')}
                  {renderSortHeader('lease', 'Lease Period')}
                  {renderSortHeader('status', 'Status')}
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedTenants.map((t) => {
                  const unitPropId = t.units?.property_id;
                  const unitId = t.units?.id;

                  return (
                    <tr key={t.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/tenants/${t.id}`)}
                          className="text-left font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-800"
                        >
                          {formatTenantName(t.name)}
                        </button>
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
                            <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(t.email)}`} target="_blank" rel="noreferrer" className="text-slate-900 underline">
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
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/dashboard/tenants/${t.id}`)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit tenant
                          </button>
                          {unitPropId && unitId ? (
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/properties/${unitPropId}/units/${unitId}`)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              View unit →
                            </button>
                          ) : null}
                        </div>
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
