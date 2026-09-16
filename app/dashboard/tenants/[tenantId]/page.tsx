'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from '../../logout-button';

type Tenant = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  status: string;
  emergency_contact?: string | null;
  notes?: string | null;
  units?: { id: string; unit_number: string; property_id?: string; properties?: { name: string; address: string } };
};

export default function TenantEditPage() {
  const router = useRouter();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '', lease_start: '', lease_end: '', status: 'active', emergency_contact: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const user = data.session?.user;
      if (!user) return router.replace('/login');
      const role = await fetchUserRole(user.email, supabase);
      if (role === 'tenant') return router.replace('/dashboard');
      setSession({ id: user.id, name: user.user_metadata?.full_name || user.email || 'User', email: user.email || '', role });

      const response = await fetch(`/api/tenants/${tenantId}`, { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result?.error || 'Unable to load tenant.');
      } else {
        const next = result.tenant as Tenant;
        setTenant(next);
        setDraft({
          name: next.name ?? '', email: next.email ?? '', phone: next.phone ?? '',
          lease_start: next.lease_start ?? '', lease_end: next.lease_end ?? '', status: next.status ?? 'active',
          emergency_contact: next.emergency_contact ?? '', notes: next.notes ?? '',
        });
      }
      setLoading(false);
    };
    void load();
  }, [router, tenantId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify(draft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Tenant update failed.');
      router.push('/dashboard/tenants');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Tenant update failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!session || loading) return null;

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => router.push('/dashboard/tenants')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">← Tenants Directory</button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push('/dashboard')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Maintenance Tickets</button>
            <LogoutButton />
          </div>
        </div>
        <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Edit tenant</p>
          <h1 className="mt-2 text-2xl font-semibold">{tenant?.name}</h1>
          {tenant?.units && <p className="mt-1 text-sm text-slate-500">{tenant.units.properties?.name} · Unit {tenant.units.unit_number}</p>}
          {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ['name', 'Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
              ['lease_start', 'Lease start', 'date'], ['lease_end', 'Lease end', 'date'], ['emergency_contact', 'Emergency contact', 'text'],
            ].map(([key, label, type]) => (
              <label key={key} className="text-sm font-medium text-slate-700">{label}
                <input type={type} value={draft[key as keyof typeof draft]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500" />
              </label>
            ))}
            <label className="text-sm font-medium text-slate-700">Status
              <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="active">Active</option><option value="pending">Pending</option><option value="past">Past</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-sm font-medium text-slate-700">Notes
              <textarea rows={4} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => router.push('/dashboard/tenants')} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save tenant'}</button>
          </div>
        </form>
      </div>
    </main>
  );
}