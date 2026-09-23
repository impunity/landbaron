'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, getRoleLabel, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from './logout-button';

type MeProfile = {
  name: string | null;
  avatarUrl: string | null;
  organizationName: string | null;
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

export function UserStatusBar() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<MeProfile | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    const syncSession = async () => {
      const { data } = await client.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser) {
        setSession(null);
        return;
      }

      const role = await fetchUserRole(sessionUser.email, client);
      setSession({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
      });
    };

    void syncSession();

    const { data: authListener } = client.auth.onAuthStateChange(async (event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser) {
        setSession(null);
        return;
      }

      const role = await fetchUserRole(nextUser.email, client);
      setSession({
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'User',
        email: nextUser.email || '',
        role,
      });

      if (event === 'SIGNED_IN' && nextSession?.access_token) {
        void fetch('/api/login-events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${nextSession.access_token}` },
        }).catch(() => {});
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }

    void (async () => {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        return;
      }

      const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setProfile({
          name: result.name ?? null,
          avatarUrl: result.avatarUrl ?? null,
          organizationName: result.organizationName ?? null,
        });
      }
    })();
  }, [session]);

  if (!session) {
    return null;
  }

  const displayName = profile?.name || session.name;
  const avatarSrc =
    profile?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0f766e&color=fff`;

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        {profile?.organizationName ? (
          (session.role === 'owner' || session.role === 'manager') ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/organization')}
              className="text-sm font-semibold text-slate-900 hover:text-slate-700"
            >
              {profile.organizationName}
            </button>
          ) : (
            <span className="text-sm font-semibold text-slate-900">{profile.organizationName}</span>
          )
        ) : (
          <span />
        )}

        <div className="flex items-center gap-3">
        <img
          src={avatarSrc}
          alt={`${displayName} avatar`}
          className="h-9 w-9 rounded-full border border-slate-200 object-cover"
          onError={(event) => {
            event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getInitials(displayName))}&background=0f766e&color=fff`;
          }}
        />
        <div className="text-right leading-tight">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            {getRoleLabel(session.role)}
          </p>
        </div>
        <LogoutButton />
        </div>
      </div>
    </div>
  );
}
