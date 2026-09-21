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

  return `${siteUrl.replace(/\/$/, '')}/dashboard/properties`;
};

export default function LoginPage() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
          router.replace(role === 'tenant' ? '/dashboard' : '/dashboard/properties');
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
