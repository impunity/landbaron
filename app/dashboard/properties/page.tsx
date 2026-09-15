'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, getRoleLabel, getUserRoleByEmail, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type UnitSummary = {
  id: string;
  unit_number: string;
  rent_amount?: number | null;
  tenants?: Array<{ id: string; name: string; email?: string | null; phone?: string | null }>;
  unit_photos?: Array<{ id: string; photo_url: string; caption?: string | null }>;
};

type Property = {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  created_at: string;
  units?: UnitSummary[];
};

type PropertyDraft = {
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
};

const emptyPropertyDraft: PropertyDraft = {
  name: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  notes: '',
};

export default function PropertiesPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [draft, setDraft] = useState<PropertyDraft>(emptyPropertyDraft);
  const [saving, setSaving] = useState(false);

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

      const currentRole = await fetchUserRole(sessionUser.email, client);
      if (currentRole === 'tenant') {
        router.replace('/dashboard');
        return;
      }

      setSessionState({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role: currentRole,
      });
    };

    syncSession();

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser) {
        setSessionState(null);
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(nextUser.email, client);
      if (role === 'tenant') {
        router.replace('/dashboard');
        return;
      }

      setSessionState({
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'User',
        email: nextUser.email || '',
        role,
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const loadProperties = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/properties', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to load properties.');
      }

      setProperties(Array.isArray(result.properties) ? result.properties : []);
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load properties. Ensure database tables are created.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && session.role !== 'tenant') {
      void loadProperties();
    }
  }, [session]);

  const filteredProperties = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return properties;

    return properties.filter((prop) => {
      const nameMatch = prop.name.toLowerCase().includes(query);
      const addressMatch = prop.address.toLowerCase().includes(query);
      const cityMatch = (prop.city ?? '').toLowerCase().includes(query);
      return nameMatch || addressMatch || cityMatch;
    });
  }, [properties, searchTerm]);

  const handleCreateProperty = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.address.trim()) {
      setError('Name and address are required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(draft),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not create property.');
      }

      setDraft(emptyPropertyDraft);
      setShowAddModal(false);
      await loadProperties();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Could not create property.');
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
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
                Properties
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Properties & Units
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/tenants')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Tenants list
            </button>
            {session.role === 'owner' && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/staff')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Staff roster
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + Add property
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mb-6 flex items-center justify-between gap-4">
          <input
            type="text"
            placeholder="Search properties by name, address, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-slate-500"
          />
          <p className="text-sm text-slate-500">
            {filteredProperties.length} propert{filteredProperties.length === 1 ? 'y' : 'ies'}
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading properties...
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <h3 className="text-base font-semibold text-slate-900">No properties found</h3>
            <p className="mt-2 text-sm text-slate-500">
              {searchTerm
                ? 'Try adjusting your search query.'
                : 'Get started by adding your first property.'}
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + Add property
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.map((prop) => {
              const unitCount = prop.units?.length ?? 0;
              const tenantCount = (prop.units ?? []).reduce(
                (sum, u) => sum + (u.tenants?.length ?? 0),
                0,
              );

              // Find first available photo from the property's units
              const firstUnitWithPhoto = (prop.units ?? []).find(
                (u) => (u.unit_photos?.length ?? 0) > 0,
              );
              const propertyThumbnail = firstUnitWithPhoto?.unit_photos?.[0]?.photo_url;

              return (
                <div
                  key={prop.id}
                  onClick={() => router.push(`/dashboard/properties/${prop.id}`)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-400 hover:shadow-md"
                >
                  {/* Thumbnail Banner */}
                  {propertyThumbnail ? (
                    <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                      <img
                        src={propertyThumbnail}
                        alt={prop.name}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <div className="absolute bottom-2 left-2 rounded-lg bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        Unit {firstUnitWithPhoto?.unit_number} photo
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-3xl text-slate-300">
                      🏢
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-slate-800">
                          {prop.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">{prop.address}</p>
                        {(prop.city || prop.state || prop.postal_code) && (
                          <p className="text-xs text-slate-500">
                            {[prop.city, prop.state, prop.postal_code].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-center">
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Units
                        </p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{unitCount}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Tenants
                        </p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{tenantCount}</p>
                      </div>
                    </div>

                    {prop.notes && (
                      <p className="mt-3 truncate text-xs text-slate-500">Note: {prop.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Property Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-slate-900">Add new property</h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter the property details and address to start tracking units.
              </p>

              <form onSubmit={handleCreateProperty} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Property name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Oakridge Manor or 1734 29th St"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Street address *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1734 29th St"
                    value={draft.address}
                    onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">City</label>
                    <input
                      type="text"
                      placeholder="San Diego"
                      value={draft.city}
                      onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">State</label>
                    <input
                      type="text"
                      placeholder="CA"
                      value={draft.state}
                      onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Zip</label>
                    <input
                      type="text"
                      placeholder="92102"
                      value={draft.postal_code}
                      onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    rows={3}
                    placeholder="General property notes (access codes, parcel info, etc.)"
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {saving ? 'Creating...' : 'Save property'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
