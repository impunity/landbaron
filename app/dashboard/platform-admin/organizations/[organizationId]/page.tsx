'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PLATFORM_RESOURCES, type PlatformResourceKey } from '@/lib/platform-admin';
import { usePlatformData } from '../../use-platform-data';

type OrganizationData = {
  organization: Record<string, unknown>;
  records: Record<string, unknown>[];
  total: number;
  pageSize: number;
};

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">Not configured</span>;
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    return <a href={value} target="_blank" rel="noopener noreferrer" className="break-all text-teal-800 underline">{value}</a>;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return <div className="space-y-1">{value.map((entry, index) => <div key={index}><FieldValue value={entry} /></div>)}</div>;
  }
  if (typeof value === 'object') return <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(value, null, 2)}</pre>;
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function RecordFields({ record }: { record: Record<string, unknown> }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {Object.entries(record).map(([key, value]) => (
        <div key={key} className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium capitalize text-slate-500">{key.replaceAll('_', ' ')}</dt>
          <dd className="min-w-0"><FieldValue value={value} /></dd>
        </div>
      ))}
    </dl>
  );
}

function getRecordLabel(record: Record<string, unknown>, index: number) {
  for (const key of ['name', 'title', 'file_name', 'label', 'unit_number', 'door', 'garage_id', 'author_name', 'email', 'caption']) {
    if (typeof record[key] === 'string' && record[key]) return record[key];
  }
  return `Record ${index + 1}`;
}

export default function PlatformOrganizationPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [resource, setResource] = useState<PlatformResourceKey>('properties');
  const [page, setPage] = useState(0);
  const url = `/api/platform-admin/organizations/${encodeURIComponent(organizationId)}?resource=${resource}&page=${page}`;
  const { data, loading, error } = usePlatformData<OrganizationData>(url);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard/platform-admin" className="text-sm font-medium text-slate-600 hover:text-slate-900">&larr; Back</Link>
        <header className="mt-4 border-b border-slate-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Platform Admin / Read-only</p>
          <h1 className="mt-2 text-3xl font-semibold">{typeof data?.organization.name === 'string' ? data.organization.name : 'Organization'}</h1>
          <p className="mt-2 text-sm text-slate-500">Browse organization records and attachments. No editing, impersonation, or credential access is available here.</p>
        </header>
        {data && (
          <details className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer font-semibold">Organization details & contacts</summary>
            <div className="mt-4"><RecordFields record={data.organization} /></div>
          </details>
        )}
        <nav aria-label="Organization data" className="mt-6 flex flex-wrap gap-2">
          {(Object.keys(PLATFORM_RESOURCES) as PlatformResourceKey[]).map((key) => (
            <button key={key} type="button" aria-pressed={resource === key} onClick={() => { setResource(key); setPage(0); }} className={`rounded-lg border px-3 py-2 text-sm font-medium ${resource === key ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {PLATFORM_RESOURCES[key].label}
            </button>
          ))}
        </nav>
        <section className="mt-6">
          <h2 className="text-xl font-semibold">{PLATFORM_RESOURCES[resource].label}</h2>
          {loading ? <p className="mt-4 rounded-xl bg-white p-6 text-slate-500">Loading records...</p> : error ? (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div>
          ) : data && (
            <>
              <p className="mt-2 text-sm text-slate-500">{data.total} records{data.total > 0 && ` · Showing ${page * data.pageSize + 1}–${Math.min((page + 1) * data.pageSize, data.total)}`}</p>
              <div className="mt-4 space-y-3">
                {data.records.map((record, index) => (
                  <details key={`${resource}-${page}-${index}`} className="rounded-xl border border-slate-200 bg-white p-5">
                    <summary className="cursor-pointer font-semibold">{getRecordLabel(record, page * data.pageSize + index)}</summary>
                    <div className="mt-4"><RecordFields record={record} /></div>
                  </details>
                ))}
                {data.records.length === 0 && <p className="rounded-xl bg-white p-6 text-slate-500">No records in this section.</p>}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40">Previous</button>
                <span className="text-sm text-slate-500">Page {page + 1} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
                <button type="button" disabled={(page + 1) * data.pageSize >= data.total} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40">Next</button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
