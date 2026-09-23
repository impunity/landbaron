'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

type Organization = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  tax_id?: string | null;
  website_url?: string | null;
  avatar_url?: string | null;
  invite_code?: string | null;
};

type OrganizationDraft = {
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  contact_email: string;
  contact_phone: string;
  tax_id: string;
  website_url: string;
};

const emptyDraft: OrganizationDraft = {
  name: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  contact_email: '',
  contact_phone: '',
  tax_id: '',
  website_url: '',
};

const getInitials = (name: string) => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'ORG';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
};

export default function OrganizationPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [draft, setDraft] = useState<OrganizationDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

  const loadOrganization = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/organization', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to load organization details.');
      }

      const org = result.organization as Organization | null;
      setOrganization(org);

      if (org) {
        setDraft({
          name: org.name ?? '',
          address: org.address ?? '',
          city: org.city ?? '',
          state: org.state ?? '',
          postal_code: org.postal_code ?? '',
          contact_email: org.contact_email ?? '',
          contact_phone: org.contact_phone ?? '',
          tax_id: org.tax_id ?? '',
          website_url: org.website_url ?? '',
        });
      }
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load organization details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && (session.role === 'owner' || session.role === 'manager')) {
      void loadOrganization();
    }
  }, [session]);

  const isOwner = session?.role === 'owner';

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isOwner) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/organization', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(draft),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Organization could not be updated.');
      }

      setOrganization(result.organization);
      setSuccess('Organization details saved.');
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Organization could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isOwner) return;

    setUploadingAvatar(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error('Sign in is required.');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/organization/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Avatar could not be updated.');

      setOrganization(result.organization);
    } catch (uploadError) {
      console.error(uploadError);
      setError(uploadError instanceof Error ? uploadError.message : 'Avatar could not be updated.');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
    return null;
  }

  const avatarSrc =
    organization?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(getInitials(organization?.name || 'Organization'))}&background=0f766e&color=fff&size=256`;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Organization', href: '/dashboard/organization' }]} />
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Organization</h1>
            <p className="mt-2 text-sm text-slate-600">
              {isOwner ? 'Manage your organization details.' : 'View your organization details.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DashboardNavButtons current="organization" role={session.role} />
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        )}
        {success && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading organization details...
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-4">
              <img
                src={avatarSrc}
                alt="Organization avatar"
                className="h-20 w-20 rounded-full border border-slate-200 object-cover"
              />
              {isOwner && (
                <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {uploadingAvatar ? 'Uploading...' : 'Change avatar'}
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} className="hidden" />
                </label>
              )}
            </div>

            {organization?.invite_code && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Access request invite code</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-slate-900">{organization.invite_code}</p>
                <p className="mt-1 text-xs text-slate-500">Share this code with people who need to request access to this organization.</p>
              </div>
            )}

            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Organization / Owner name *</label>
                <input
                  type="text"
                  required
                  disabled={!isOwner}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={draft.state}
                    onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={draft.postal_code}
                    onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact email</label>
                <input
                  type="email"
                  disabled={!isOwner}
                  value={draft.contact_email}
                  onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact phone</label>
                <input
                  type="tel"
                  disabled={!isOwner}
                  value={draft.contact_phone}
                  onChange={(e) => setDraft({ ...draft, contact_phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tax ID</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={draft.tax_id}
                  onChange={(e) => setDraft({ ...draft, tax_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Website URL</label>
                <input
                  type="url"
                  placeholder="https://"
                  disabled={!isOwner}
                  value={draft.website_url}
                  onChange={(e) => setDraft({ ...draft, website_url: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              </div>

              {isOwner && (
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
