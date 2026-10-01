'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type DirectoryEntry = {
  id: string;
  name: string;
  unit_number: string;
  avatar_url: string | null;
  shared: boolean;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
};

export default function TenantDirectoryPage() {
  const router = useRouter();
  const [property, setProperty] = useState<{ name: string; address: string } | null>(null);
  const [tenants, setTenants] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const token = (await supabase?.auth.getSession())?.data.session?.access_token;
        const response = await fetch('/api/tenant-portal/directory', { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Tenant directory could not be loaded.');
        setProperty(result.property);
        setTenants(result.tenants ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Tenant directory could not be loaded.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <button type="button" onClick={() => router.push('/dashboard')} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">← Return to Maintenance Portal</button>
          <h1 className="mt-2 text-3xl font-semibold">Tenant Directory</h1>
          {property && <p className="mt-1 text-sm text-slate-500">{property.name} · {property.address}</p>}
        </header>
        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Loading directory...</div>
        ) : error ? (
          <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : tenants.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">No other tenants are listed at this property yet.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <img src={tenant.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(tenant.name)}&background=0f766e&color=fff&size=160`} alt={`${tenant.name} avatar`} className="h-20 w-20 shrink-0 rounded-full object-cover" />
                <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                  <p className="font-semibold">{tenant.name}</p>
                  {tenant.unit_number && <p className="text-xs uppercase tracking-wider text-slate-500">Unit {tenant.unit_number}</p>}
                  {tenant.shared ? (
                    <>
                      {tenant.email && <a className="mt-2 block w-max text-sm text-slate-700 underline" href={`mailto:${tenant.email}`}>{tenant.email}</a>}
                      {tenant.phone && <a className="block w-max text-sm text-slate-700 underline" href={`tel:${tenant.phone}`}>{tenant.phone}</a>}
                      {tenant.instagram_handle && <a className="block w-max text-sm text-slate-700 underline" href={`https://instagram.com/${encodeURIComponent(tenant.instagram_handle)}`} target="_blank" rel="noopener noreferrer">@{tenant.instagram_handle}</a>}
                    </>
                  ) : (
                    <p className="mt-2 text-sm italic text-slate-500">Contact info not shared</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
