'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

type Measurement = { total?: number | null; units?: string | null };
type SolarOverview = {
  production?: Measurement;
  consumption?: Measurement;
  performance?: { specificYield?: number | null; performanceRatio?: number | null };
};
type SolarProperty = {
  id: string;
  name: string;
  siteId: string | null;
  status: 'connected' | 'not_connected' | 'error';
  overview?: SolarOverview;
};

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

const formatMeasurement = (measurement?: Measurement) => {
  if (typeof measurement?.total !== 'number') return 'Unavailable';
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(measurement.total)} ${measurement.units ?? ''}`.trim();
};

export default function SolarPowerPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [properties, setProperties] = useState<SolarProperty[]>([]);
  const [loading, setLoading] = useState(true);
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
        const connection = new URLSearchParams(window.location.search).get('connection');
        if (connection === 'connected') setNotice('SolarEdge connected successfully.');
        if (connection === 'failed') {
          const reason = new URLSearchParams(window.location.search).get('connectionReason') ?? '';
          setError(`SolarEdge connection failed: ${connectionFailureMessages[reason] ?? 'Check credentials and registered callback URL in Settings.'}`);
        }
        const response = await fetch('/api/solar-power', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Solar power data could not be loaded.');
        setProperties(result.properties ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Solar power data could not be loaded.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Solar Power', href: '/dashboard/solar-power' }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Solar Power</h1><p className="mt-1 text-sm text-slate-600">SolarEdge site overview</p></div></div>
        {role && <div className="mt-4 flex flex-wrap gap-2"><DashboardNavButtons current="solar-power" role={role} /></div>}
        {notice && <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <p className="mt-6 text-sm text-slate-500">Loading solar sites...</p> : properties.length === 0 ? (
          <p className="mt-6 border-t border-slate-300 bg-white px-5 py-6 text-sm text-slate-600">No properties are currently enabled for solar power.</p>
        ) : <section className="mt-6 divide-y divide-slate-200 border-y border-slate-300 bg-white px-5 sm:px-6">
          {properties.map((property) => <article key={property.id} className="py-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{property.name}</h2>{property.siteId && <p className="text-xs text-slate-500">SolarEdge site {property.siteId}</p>}</div>{property.status === 'connected' ? <span className="text-sm font-medium text-emerald-700">Connected</span> : <a href="/dashboard/settings" className="text-sm font-medium text-teal-800 underline">{property.status === 'not_connected' ? 'Complete setup in Settings' : 'Reconnect in Settings'}</a>}</div>
            {property.overview && <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Production</dt><dd className="mt-1 text-lg font-semibold">{formatMeasurement(property.overview.production)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Consumption</dt><dd className="mt-1 text-lg font-semibold">{formatMeasurement(property.overview.consumption)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Specific yield</dt><dd className="mt-1 text-lg font-semibold">{property.overview.performance?.specificYield ?? 'Unavailable'}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Performance ratio</dt><dd className="mt-1 text-lg font-semibold">{property.overview.performance?.performanceRatio ?? 'Unavailable'}</dd></div>
            </dl>}
          </article>)}
        </section>}
      </div>
    </main>
  );
}