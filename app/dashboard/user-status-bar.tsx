'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';

import { fetchUserRole, getRoleLabel, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from './logout-button';

type MeProfile = {
  userId: string;
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadPropertyId, setUnreadPropertyId] = useState<string | null>(null);

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
      return;
    }

    const refreshProfile = async () => {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        return;
      }

      const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` } });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setProfile({
          userId: session.id,
          name: result.name ?? null,
          avatarUrl: result.avatarUrl ?? null,
          organizationName: result.organizationName ?? null,
        });
      }
    };

    void refreshProfile();
    window.addEventListener('landbaron-profile-avatar-changed', refreshProfile);
    return () => window.removeEventListener('landbaron-profile-avatar-changed', refreshProfile);
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let active = true;
    const refreshUnread = async () => {
      const accessToken = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!accessToken) return;
      const response = await fetch('/api/announcements/unread', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }).catch(() => null);
      if (!response?.ok) return;
      const result = await response.json().catch(() => ({}));
      if (active) {
        const count = Number.isSafeInteger(result.count) && result.count > 0 ? result.count : 0;
        setUnreadCount(count);
        setUnreadPropertyId(count && typeof result.propertyId === 'string' ? result.propertyId : null);
      }
    };

    void refreshUnread();
    const timer = window.setInterval(() => void refreshUnread(), 120_000);
    const handleFocus = () => void refreshUnread();
    const handleRead = () => void refreshUnread();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('landbaron-unread-changed', handleRead);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('landbaron-unread-changed', handleRead);
    };
  }, [session]);

  if (!session) {
    return null;
  }

  const currentProfile = profile?.userId === session.id ? profile : null;
  const displayName = currentProfile?.name || session.name;
  const avatarSrc =
    currentProfile?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0f766e&color=fff`;

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        {currentProfile?.organizationName ? (
          (session.role === 'owner' || session.role === 'manager') ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/organization')}
              className="text-sm font-semibold text-slate-900 hover:text-slate-700"
            >
              {currentProfile.organizationName}
            </button>
          ) : (
            <span className="text-sm font-semibold text-slate-900">{currentProfile.organizationName}</span>
          )
        ) : (
          <span />
        )}

        <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push(unreadCount > 0 && unreadPropertyId ? `/dashboard/properties/${encodeURIComponent(unreadPropertyId)}/announcements` : '/dashboard/settings')} title={unreadCount > 0 ? 'Open unread discussions' : 'Profile settings'} aria-label={unreadCount > 0 ? `Open ${unreadCount} unread discussions` : 'Open profile settings'} className="relative size-9 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
          <img
            src={avatarSrc}
            alt={`${displayName} avatar`}
            className="size-9 rounded-full border border-slate-200 object-cover"
            onError={(event) => {
              event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getInitials(displayName))}&background=0f766e&color=fff`;
            }}
          />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[9px] font-bold leading-none text-white" title={`${unreadCount} unread discussion${unreadCount === 1 ? '' : 's'}`} aria-label={`${unreadCount} unread discussion${unreadCount === 1 ? '' : 's'}`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
        <div className="text-right leading-tight">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            {getRoleLabel(session.role)}
          </p>
        </div>
        <button type="button" onClick={() => router.push('/dashboard/settings')} title="Settings" aria-label="Settings" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"><Settings size={19} aria-hidden="true" /></button>
        <LogoutButton />
        </div>
      </div>
    </div>
  );
}
