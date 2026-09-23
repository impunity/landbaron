'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../../breadcrumbs';
import { DashboardNavButtons } from '../../nav-buttons';

type AccessRequest = {
  id: string;
  organization_id: string;
  requested_role: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  organizations?: { name: string };
};

type Property = {
  id: string;
  name: string;
  address: string;
  units?: Array<{ id: string; unit_number: string }>;
};

export default function AccessRequestPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [session, setSession] = useState<SessionUser | null>(null);
  const [accessRequest, setAccessRequest] = useState<AccessRequest | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [unitId, setUnitId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    void (async () => {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(user.email, client);
      const nextSession = {
        id: user.id,
        name: user.user_metadata?.full_name || user.email || 'User',
        email: user.email || '',
        role,
      } satisfies SessionUser;
      setSession(nextSession);

      if (role !== 'owner' && role !== 'manager') {
        router.replace('/dashboard');
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!session || !token || (session.role !== 'owner' && session.role !== 'manager')) return;

    void (async () => {
      try {
        const accessToken = (await supabase?.auth.getSession())?.data.session?.access_token;
        const response = await fetch(`/api/access-requests?token=${encodeURIComponent(token)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Unable to load access request.');
        setAccessRequest(result.request);
        setProperties(result.properties ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load access request.');
      } finally {
        setLoading(false);
      }
    })();
  }, [session, token]);

  const resolveRequest = async (action: 'accept' | 'decline') => {
    setSaving(true);
    setError(null);

    try {
      const accessToken = (await supabase?.auth.getSession())?.data.session?.access_token;
      const response = await fetch('/api/access-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ token, action, unit_id: unitId || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Access request could not be resolved.');
      setMessage(action === 'accept' ? 'Access accepted.' : 'Access request declined.');
      setAccessRequest((current) => current ? { ...current, status: result.status } : current);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Access request could not be resolved.');
    } finally {
      setSaving(false);
    }
  };

  if (!session || (session.role !== 'owner' && session.role !== 'manager')) return null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Access Request', href: `/dashboard/access-requests/${token}` }]} />
            <h1 className="mt-2 text-3xl font-semibold">Access Request</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3"><DashboardNavButtons role={session.role} /></div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading request...</div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : accessRequest ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Organization: {accessRequest.organizations?.name}</p>
            <h2 className="mt-2 text-2xl font-semibold">{accessRequest.name}</h2>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Requested role</dt><dd className="font-medium capitalize">{accessRequest.requested_role}</dd></div>
              <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{accessRequest.email}</dd></div>
              <div><dt className="text-slate-500">Phone</dt><dd className="font-medium">{accessRequest.phone}</dd></div>
              <div><dt className="text-slate-500">Address</dt><dd className="font-medium">{accessRequest.address}</dd></div>
            </dl>

            {accessRequest.requested_role === 'tenant' && accessRequest.status === 'pending' && (
              <label className="mt-6 block text-sm font-medium text-slate-700">
                Assign property and unit
                <select value={unitId} onChange={(event) => setUnitId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="">Select a unit</option>
                  {properties.flatMap((property) => (property.units ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>{property.name} — Unit {unit.unit_number}</option>
                  )))}
                </select>
              </label>
            )}

            {message && <p className="mt-5 text-sm text-emerald-700">{message}</p>}
            {accessRequest.status === 'pending' && (
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => void resolveRequest('decline')} disabled={saving} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-60">Decline</button>
                <button type="button" onClick={() => void resolveRequest('accept')} disabled={saving || (accessRequest.requested_role === 'tenant' && !unitId)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Accept access'}</button>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
