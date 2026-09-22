'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type LoginEvent = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string;
};

const getInitials = (name: string) => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'U';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
};

export default function UsageLogPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const nextSession: SessionUser = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
      };

      setSession(nextSession);
      if (nextSession.role !== 'owner' && nextSession.role !== 'manager') {
        router.replace('/dashboard');
      }
    };

    void syncSession();

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;

      if (!nextUser) {
        setSession(null);
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(nextUser.email, client);
      const nextSessionUser: SessionUser = {
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'User',
        email: nextUser.email || '',
        role,
      };

      setSession(nextSessionUser);
      if (nextSessionUser.role !== 'owner' && nextSessionUser.role !== 'manager') {
        router.replace('/dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
      return;
    }

    const loadEvents = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
        const accessToken = authData.session?.access_token;

        if (!accessToken) {
          throw new Error('Sign in is required.');
        }

        const response = await fetch('/api/login-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.error || 'Unable to load the usage log.');
        }

        setEvents(Array.isArray(result.events) ? result.events : []);
      } catch (loadError) {
        console.error(loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load the usage log.');
      } finally {
        setLoading(false);
      }
    };

    void loadEvents();
  }, [session]);

  if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800"
              >
                Dashboard
              </button>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                Usage Log
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Usage Log</h1>
            <p className="mt-2 text-sm text-slate-600">A running log of every sign-in to the system.</p>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading usage log...
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            No login activity recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-200">
              {events.map((event) => {
                const displayName = event.name || event.email;
                const avatarSrc =
                  event.avatar_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(getInitials(displayName))}&background=0f766e&color=fff`;

                return (
                  <li key={event.id} className="flex items-center gap-4 px-5 py-4">
                    <img
                      src={avatarSrc}
                      alt={`${displayName} avatar`}
                      className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                      <p className="truncate text-xs text-slate-500">{event.email}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p className="font-medium uppercase tracking-wider text-slate-600">{event.role ?? 'Unknown'}</p>
                      <p className="mt-0.5">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
