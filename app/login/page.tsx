'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const client = supabase;

    if (!client) {
      setError('Supabase is not configured for this environment yet.');
      setLoading(false);
      return;
    }

    try {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : 'https://landbaron.vercel.app');
      const redirectTo = `${siteUrl.replace(/\/$/, '')}/dashboard/properties`;

      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (loginError) {
      console.error(loginError);
      setError('Google sign-in could not be started. Please try again.');
    } finally {
      setLoading(false);
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
        <div className="mx-auto mb-6 h-72 w-72 overflow-hidden rounded-full ring-4 ring-white shadow-md sm:h-96 sm:w-96">
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
          <h1 className="text-3xl font-semibold text-slate-900">Sign in with Google</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use your Google account to access the maintenance workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
