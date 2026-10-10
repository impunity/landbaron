'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { compareOrganizations, type OrganizationSortKey, type PlatformOrganization } from '@/lib/platform-admin';
import { usePlatformData } from './use-platform-data';

const SORT_COLUMNS: { key: OrganizationSortKey; label: string }[] = [
  { key: 'name', label: 'Organization' },
  { key: 'properties', label: 'Properties' },
  { key: 'units', label: 'Units' },
  { key: 'tenants', label: 'Tenants' },
  { key: 'ownersCount', label: 'Owners' },
  { key: 'managers', label: 'Managers' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'contractors', label: 'Contractors' },
  { key: 'daysSinceLastLogin', label: 'Days since last login' },
];

export default function PlatformAdminPage() {
  const { data, loading, error } = usePlatformData<{ organizations: PlatformOrganization[] }>('/api/platform-admin');
  const [sortKey, setSortKey] = useState<OrganizationSortKey>('name');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const organizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.organizations ?? [])
      .filter((organization) => !query || [organization.name, ...organization.owners.map((owner) => `${owner.name} ${owner.email ?? ''}`)].some((value) => value.toLowerCase().includes(query)))
      .toSorted((a, b) => compareOrganizations(a, b, sortKey, direction));
  }, [data, search, sortKey, direction]);
  const totals = (data?.organizations ?? []).reduce((sum, organization) => ({
    units: sum.units + organization.units,
    tenants: sum.tenants + organization.tenants,
    staff: sum.staff + organization.ownersCount + organization.managers + organization.maintenance + organization.contractors,
  }), { units: 0, tenants: 0, staff: 0 });

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">&larr; Back</Link>
        <header className="mt-4 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-semibold">Platform Admin</h1>
          <p className="mt-2 text-sm text-slate-600">Read-only access across all organizations. Organization permissions remain unchanged.</p>
        </header>
        {loading ? <p className="mt-8 rounded-xl bg-white p-6 text-slate-600">Loading organizations...</p> : error ? (
          <div role="alert" className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div>
        ) : (
          <>
            <section aria-label="Platform totals" className="mt-6 grid gap-4 sm:grid-cols-4">
              {[
                ['Organizations', data?.organizations.length ?? 0],
                ['Units', totals.units],
                ['Tenants', totals.tenants],
                ['Owners & staff', totals.staff],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </section>
            <label className="mt-6 block text-sm font-medium text-slate-700">
              Search organizations or owners
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 block w-full max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <p className="mt-4 text-xs text-slate-500">Click a column heading to sort. Counts include all configured tenant records. Last login is the latest recorded login by any organization member; organizations with no history appear last.</p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {SORT_COLUMNS.map((column) => (
                      <th key={column.key} scope="col" aria-sort={sortKey === column.key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="px-4 py-3">
                        <button type="button" onClick={() => {
                          setDirection(sortKey === column.key && direction === 'asc' ? 'desc' : 'asc');
                          setSortKey(column.key);
                        }} className="whitespace-nowrap font-semibold hover:text-teal-700">
                          {column.label}{sortKey === column.key ? direction === 'asc' ? ' ↑' : ' ↓' : ''}
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">Owner contacts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {organizations.map((organization) => (
                    <tr key={organization.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <Link href={`/dashboard/platform-admin/organizations/${organization.id}`} className="font-semibold text-teal-800 underline">{organization.name}</Link>
                        <p className="mt-1 text-xs text-slate-500">Read-only organization view</p>
                      </td>
                      {[organization.properties, organization.units, organization.tenants, organization.ownersCount, organization.managers, organization.maintenance, organization.contractors].map((count, index) => (
                        <td key={index} className="px-4 py-4 tabular-nums">{count}</td>
                      ))}
                      <td className="px-4 py-4 tabular-nums">
                        {organization.daysSinceLastLogin ?? 'Never recorded'}
                        {organization.lastLoginAt && <p className="mt-1 whitespace-nowrap text-xs text-slate-500">{new Date(organization.lastLoginAt).toLocaleDateString()}</p>}
                      </td>
                      <td className="min-w-56 space-y-3 px-4 py-4">
                        {organization.owners.length === 0 ? <span className="text-slate-500">No owner contact configured</span> : organization.owners.map((owner, index) => (
                          <div key={index}>
                            <p className="font-medium">{owner.name}</p>
                            {owner.email && <a href={`mailto:${owner.email}`} className="block text-xs text-teal-800 underline">{owner.email}</a>}
                            {owner.phone && <a href={`tel:${owner.phone}`} className="block text-xs text-teal-800 underline">{owner.phone}</a>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {organizations.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500">{search ? 'No organizations match your search.' : 'No organizations have been configured yet.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
