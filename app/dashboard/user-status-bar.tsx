'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { fetchUserRole, getRoleLabel, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from './logout-button';

type MeProfile = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  organizationName: string | null;
};

type AnnouncementProperty = { id: string; name: string; address: string };

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
  const pathname = usePathname();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [properties, setProperties] = useState<AnnouncementProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

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
          userId: session.id,
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

  const currentProfile = profile?.userId === session.id ? profile : null;
  const displayName = currentProfile?.name || session.name;
  const avatarSrc =
    currentProfile?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0f766e&color=fff`;

  const openAnnouncements = async () => {
    const propertyId = pathname?.match(/^\/dashboard\/properties\/([^/]+)(?:\/|$)/)?.[1];
    if (propertyId) {
      router.push(`/dashboard/properties/${propertyId}/announcements`);
      return;
    }

    setShowPropertyPicker(true);
    setPropertiesLoading(true);
    setPropertiesError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch('/api/announcements/properties', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Properties could not be loaded.');
      setProperties(result.properties ?? []);
    } catch (error) {
      setPropertiesError(error instanceof Error ? error.message : 'Properties could not be loaded.');
    } finally {
      setPropertiesLoading(false);
    }
  };

  return (
    <>
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
        <button type="button" onClick={() => void openAnnouncements()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">Announcements/Discussions</button>
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
    {showPropertyPicker && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPropertyPicker(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="announcement-property-title" onKeyDown={(event) => { if (event.key === 'Escape') setShowPropertyPicker(false); }} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <h2 id="announcement-property-title" className="text-lg font-semibold text-slate-900">Choose a property</h2>
            <button type="button" autoFocus onClick={() => setShowPropertyPicker(false)} aria-label="Close" className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100">×</button>
          </div>
          <p className="mt-1 text-sm text-slate-600">Which property&apos;s announcements and discussions would you like to see?</p>
          {propertiesLoading ? <p className="mt-5 text-sm text-slate-500">Loading properties...</p> : propertiesError ? (
            <div className="mt-5 text-sm text-rose-700" role="alert">{propertiesError}<button type="button" onClick={() => void openAnnouncements()} className="ml-2 underline">Retry</button></div>
          ) : properties.length === 0 ? <p className="mt-5 text-sm text-slate-500">No accessible properties found.</p> : (
            <div className="mt-4 max-h-80 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200">
              {properties.map((property) => (
                <button key={property.id} type="button" onClick={() => { setShowPropertyPicker(false); router.push(`/dashboard/properties/${property.id}/announcements`); }} className="block w-full px-2 py-3 text-left hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-900">{property.name}</span>
                  <span className="block text-xs text-slate-500">{property.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
