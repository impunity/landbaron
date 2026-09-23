'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type OAuthProvider = 'google' | 'apple';

const getAuthRedirectTo = () => {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const siteUrl =
    browserOrigin.startsWith('http://localhost') || browserOrigin.startsWith('http://127.0.0.1')
      ? browserOrigin
      : process.env.NEXT_PUBLIC_SITE_URL || browserOrigin || 'https://landbaron.vercel.app';

  return `${siteUrl.replace(/\/$/, '')}/login`;
};

export default function LoginPage() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [unrecognizedUser, setUnrecognizedUser] = useState<{ email: string; name: string } | null>(null);
  const [dialogMode, setDialogMode] = useState<'setup' | 'request' | null>(null);
  const [savingDialog, setSavingDialog] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [setupDraft, setSetupDraft] = useState({ name: '', address: '', city: '', state: '', postal_code: '', contact_email: '', contact_phone: '', tax_id: '', website_url: '' });
  const [requestDraft, setRequestDraft] = useState({ invite_code: '', requested_role: 'tenant', name: '', phone: '', address: '' });

  useEffect(() => {
    let active = true;
    const client = supabase;

    if (!client) {
      setCheckingSession(false);
      return;
    }

    client.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) {
          return;
        }

        if (data.session) {
          const role = await fetchUserRole(data.session.user.email, client);
          const accessToken = data.session.access_token;
          const statusResponse = await fetch('/api/account-status', { headers: { Authorization: `Bearer ${accessToken}` } });
          const status = await statusResponse.json().catch(() => ({}));

          if (statusResponse.ok && !status.recognized) {
            const email = data.session.user.email || '';
            const name = data.session.user.user_metadata?.full_name || email.split('@')[0] || 'New user';
            setUnrecognizedUser({ email, name });
            setSetupDraft((current) => ({ ...current, contact_email: email, name }));
            setRequestDraft((current) => ({ ...current, name }));
          } else {
            router.replace(role === 'tenant' ? '/dashboard' : '/dashboard/properties');
          }
        }
      })
      .finally(() => {
        if (active) {
          setCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleSetupOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingDialog(true);
    setDialogMessage(null);
    setError(null);

    try {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const response = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify(setupDraft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Organization could not be created.');
      router.replace('/dashboard/properties');
    } catch (setupError) {
      setDialogMessage(setupError instanceof Error ? setupError.message : 'Organization could not be created.');
    } finally {
      setSavingDialog(false);
    }
  };

  const handleAccessRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingDialog(true);
    setDialogMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestDraft, email: unrecognizedUser?.email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Access request could not be submitted.');
      setDialogMessage(result.notificationError || 'Your request was sent to the organization owner.');
    } catch (requestError) {
      setDialogMessage(requestError instanceof Error ? requestError.message : 'Access request could not be submitted.');
    } finally {
      setSavingDialog(false);
    }
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setLoadingProvider(provider);
    setError(null);

    const client = supabase;

    if (!client) {
      setError('Supabase is not configured for this environment yet.');
      setLoadingProvider(null);
      return;
    }

    try {
      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthRedirectTo(),
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (loginError) {
      console.error(loginError);
      setError(`${provider === 'apple' ? 'Apple' : 'Google'} sign-in could not be started. Please try again.`);
    } finally {
      setLoadingProvider(null);
    }
  };

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">LANDBARON</p>
          <p className="mt-4 text-base text-slate-700">Checking your sign-in state...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-6 py-10">
      <div className="mb-8 w-full max-w-3xl text-center">
        <div className="mx-auto mb-6 h-[173px] w-[173px] overflow-hidden rounded-full ring-4 ring-white shadow-md sm:h-[230px] sm:w-[230px]">
          <Image
            src="/beach-chair.png"
            alt="Beach chair with a drink"
            width={1536}
            height={768}
            priority
            className="h-full w-full object-cover"
          />
        </div>
        <p className="text-4xl font-bold tracking-[0.12em] text-slate-950 sm:text-5xl">LANDBARON</p>
        <p className="mt-2 text-sm font-medium text-slate-600">Support Ticketing for Small Landlords</p>
      </div>

      {unrecognizedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            {!dialogMode ? (
              <>
                <h2 className="text-xl font-semibold text-slate-900">Welcome, {unrecognizedUser.name}</h2>
                <p className="mt-2 text-sm text-slate-600">Your account is not connected to an organization yet.</p>
                <div className="mt-6 grid gap-3">
                  <button type="button" onClick={() => setDialogMode('setup')} className="rounded-xl bg-slate-900 px-4 py-3 text-left text-sm font-medium text-white hover:bg-slate-700">Set up a new Organization &gt;</button>
                  <button type="button" onClick={() => setDialogMode('request')} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">Request access as a Tenant/Maintenance Provider/Contractor/Manager &gt;</button>
                </div>
              </>
            ) : dialogMode === 'setup' ? (
              <form onSubmit={handleSetupOrganization} className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Set up a new Organization</h2>
                <input required placeholder="Company or owner name" value={setupDraft.name} onChange={(e) => setSetupDraft({ ...setupDraft, name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Address" value={setupDraft.address} onChange={(e) => setSetupDraft({ ...setupDraft, address: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3"><input placeholder="City" value={setupDraft.city} onChange={(e) => setSetupDraft({ ...setupDraft, city: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /><input placeholder="State" value={setupDraft.state} onChange={(e) => setSetupDraft({ ...setupDraft, state: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /></div>
                <input placeholder="Postal code" value={setupDraft.postal_code} onChange={(e) => setSetupDraft({ ...setupDraft, postal_code: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3"><input type="email" placeholder="Contact email" value={setupDraft.contact_email} onChange={(e) => setSetupDraft({ ...setupDraft, contact_email: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Contact phone" value={setupDraft.contact_phone} onChange={(e) => setSetupDraft({ ...setupDraft, contact_phone: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /></div>
                <div className="grid grid-cols-2 gap-3"><input placeholder="Tax ID" value={setupDraft.tax_id} onChange={(e) => setSetupDraft({ ...setupDraft, tax_id: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /><input placeholder="Website URL" value={setupDraft.website_url} onChange={(e) => setSetupDraft({ ...setupDraft, website_url: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /></div>
                {dialogMessage && <p className="text-sm text-rose-700">{dialogMessage}</p>}
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setDialogMode(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Back</button><button type="submit" disabled={savingDialog} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{savingDialog ? 'Creating...' : 'Create Organization'}</button></div>
              </form>
            ) : (
              <form onSubmit={handleAccessRequest} className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Request access</h2>
                <p className="text-sm text-slate-600">Enter the invite code provided by the organization owner.</p>
                <input required placeholder="Organization invite code" value={requestDraft.invite_code} onChange={(e) => setRequestDraft({ ...requestDraft, invite_code: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase" />
                <select value={requestDraft.requested_role} onChange={(e) => setRequestDraft({ ...requestDraft, requested_role: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="tenant">Tenant</option><option value="maintenance">Maintenance Provider</option><option value="contractor">Contractor</option><option value="manager">Manager</option></select>
                <input required placeholder="Full name" value={requestDraft.name} onChange={(e) => setRequestDraft({ ...requestDraft, name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3"><input required placeholder="Phone number" value={requestDraft.phone} onChange={(e) => setRequestDraft({ ...requestDraft, phone: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /><input required placeholder="Address" value={requestDraft.address} onChange={(e) => setRequestDraft({ ...requestDraft, address: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /></div>
                {dialogMessage && <p className="text-sm text-slate-700">{dialogMessage}</p>}
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setDialogMode(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Back</button><button type="submit" disabled={savingDialog} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{savingDialog ? 'Sending...' : 'Send Request'}</button></div>
              </form>
            )}
          </div>
        </div>
      )}
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use your Google or Apple account to access the maintenance workspace.
          </p>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => void handleOAuthLogin('google')}
            disabled={Boolean(loadingProvider)}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingProvider === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>
          <button
            type="button"
            onClick={() => void handleOAuthLogin('apple')}
            disabled={Boolean(loadingProvider)}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-900 bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingProvider === 'apple' ? 'Redirecting to Apple...' : 'Continue with Apple'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
