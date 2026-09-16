'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { calculateEstimatedMarketRent } from '@/lib/market-rent';
import { supabase } from '@/lib/supabase';

type Tenant = {
  id: string;
  unit_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  status: string;
  emergency_contact?: string | null;
  notes?: string | null;
  created_at: string;
};

type UnitPhoto = {
  id: string;
  unit_id: string;
  photo_url: string;
  caption?: string | null;
  is_primary?: boolean | null;
  created_at: string;
};

type MaintenanceNote = {
  id: string;
  unit_id: string;
  note: string;
  category: 'work_to_consider' | 'completed_work' | 'general';
  cost?: number | null;
  performed_by?: string | null;
  performed_at?: string | null;
  created_at: string;
};

type TicketSummary = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  category?: string | null;
  updated_at: string;
  assigned_to?: string | null;
};

type UnitFullDetail = {
  id: string;
  property_id: string;
  unit_number: string;
  rent_amount?: number | null;
  bedrooms: number;
  bathrooms: number;
  square_feet?: number | null;
  status: string;
  notes?: string | null;
  properties?: {
    id: string;
    name: string;
    address: string;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
  };
  tenants?: Tenant[];
  unit_photos?: UnitPhoto[];
  unit_maintenance_notes?: MaintenanceNote[];
};

type TenantDraft = {
  name: string;
  email: string;
  phone: string;
  lease_start: string;
  lease_end: string;
  status: string;
  emergency_contact: string;
  notes: string;
};

const emptyTenantDraft: TenantDraft = {
  name: '',
  email: '',
  phone: '',
  lease_start: '',
  lease_end: '',
  status: 'active',
  emergency_contact: '',
  notes: '',
};

type NoteDraft = {
  note: string;
  category: 'work_to_consider' | 'completed_work' | 'general';
  cost: string;
  performed_by: string;
  performed_at: string;
};

const emptyNoteDraft: NoteDraft = {
  note: '',
  category: 'completed_work',
  cost: '',
  performed_by: '',
  performed_at: new Date().toISOString().split('T')[0],
};

const statusStyles: Record<string, string> = {
  Open: 'bg-rose-100 text-rose-700 ring-rose-200',
  'In Progress': 'bg-amber-100 text-amber-700 ring-amber-200',
  'Waiting on Parts': 'bg-sky-100 text-sky-700 ring-sky-200',
  Resolved: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Closed: 'bg-slate-200 text-slate-700 ring-slate-300',
  Archived: 'bg-stone-200 text-stone-700 ring-stone-300',
};

export default function UnitDetailPage() {
  const router = useRouter();
  const params = useParams<{ propertyId: string; unitId: string }>();
  const propertyId = params?.propertyId;
  const unitId = params?.unitId;

  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [unit, setUnit] = useState<UnitFullDetail | null>(null);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs & Filters
  const [noteFilter, setNoteFilter] = useState<'all' | 'completed_work' | 'work_to_consider'>('all');

  // Tenant modals
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantDraft, setTenantDraft] = useState<TenantDraft>(emptyTenantDraft);
  const [savingTenant, setSavingTenant] = useState(false);

  // Maintenance Note modal
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(emptyNoteDraft);
  const [savingNote, setSavingNote] = useState(false);

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<UnitPhoto | null>(null);

  // Unit edit (rent / details)
  const [showEditUnitModal, setShowEditUnitModal] = useState(false);
  const [unitEditDraft, setUnitEditDraft] = useState({
    unit_number: '',
    rent_amount: '',
    bedrooms: '1',
    bathrooms: '1',
    square_feet: '',
    status: 'occupied',
    notes: '',
  });
  const [savingUnitEdit, setSavingUnitEdit] = useState(false);

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
      if (role === 'tenant') {
        router.replace('/dashboard');
        return;
      }

      setSessionState({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
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

  const loadUnitDetail = async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch(`/api/units/${unitId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to load unit details.');
      }

      const unitData = result.unit as UnitFullDetail | null;
      setUnit(unitData);
      setTickets(Array.isArray(result.tickets) ? result.tickets : []);

      if (unitData) {
        setUnitEditDraft({
          unit_number: unitData.unit_number ?? '',
          rent_amount: unitData.rent_amount !== null && unitData.rent_amount !== undefined ? String(unitData.rent_amount) : '',
          bedrooms: String(unitData.bedrooms ?? 1),
          bathrooms: String(unitData.bathrooms ?? 1),
          square_feet: unitData.square_feet ? String(unitData.square_feet) : '',
          status: unitData.status ?? 'occupied',
          notes: unitData.notes ?? '',
        });
      }
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load unit details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && session.role !== 'tenant' && unitId) {
      void loadUnitDetail();
    }
  }, [session, unitId]);

  // Tenant handlers
  const handleSaveTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantDraft.name.trim() || !unitId) {
      setError('Tenant name is required.');
      return;
    }

    setSavingTenant(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const url = editingTenant ? `/api/tenants/${editingTenant.id}` : '/api/tenants';
      const method = editingTenant ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          unit_id: unitId,
          name: tenantDraft.name.trim(),
          email: tenantDraft.email.trim() || null,
          phone: tenantDraft.phone.trim() || null,
          lease_start: tenantDraft.lease_start || null,
          lease_end: tenantDraft.lease_end || null,
          status: tenantDraft.status,
          emergency_contact: tenantDraft.emergency_contact.trim() || null,
          notes: tenantDraft.notes.trim() || null,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not save tenant.');
      }

      setShowAddTenantModal(false);
      setEditingTenant(null);
      setTenantDraft(emptyTenantDraft);
      await loadUnitDetail();
    } catch (tError) {
      console.error(tError);
      setError(tError instanceof Error ? tError.message : 'Could not save tenant.');
    } finally {
      setSavingTenant(false);
    }
  };

  const handleRemoveTenant = async (tId: string, tName: string) => {
    const confirm = window.confirm(`Remove ${tName} from this unit?`);
    if (!confirm) return;

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/tenants/${tId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Could not delete tenant.');
      await loadUnitDetail();
    } catch (delError) {
      console.error(delError);
      setError(delError instanceof Error ? delError.message : 'Could not delete tenant.');
    }
  };

  // Maintenance Note handlers
  const handleSaveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteDraft.note.trim() || !unitId) {
      setError('Note description is required.');
      return;
    }

    setSavingNote(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/units/${unitId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          note: noteDraft.note.trim(),
          category: noteDraft.category,
          cost: noteDraft.cost ? Number(noteDraft.cost) : null,
          performed_by: noteDraft.performed_by.trim() || session?.name || session?.email,
          performed_at: noteDraft.performed_at || new Date().toISOString().split('T')[0],
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not save maintenance note.');
      }

      setShowAddNoteModal(false);
      setNoteDraft(emptyNoteDraft);
      await loadUnitDetail();
    } catch (nError) {
      console.error(nError);
      setError(nError instanceof Error ? nError.message : 'Could not save maintenance note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const confirm = window.confirm('Delete this maintenance record?');
    if (!confirm || !unitId) return;

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/units/${unitId}/notes?noteId=${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Could not delete note.');
      await loadUnitDetail();
    } catch (delError) {
      console.error(delError);
      setError(delError instanceof Error ? delError.message : 'Could not delete note.');
    }
  };

  const handleToggleNoteCategory = async (note: MaintenanceNote) => {
    if (!unitId) return;
    const nextCategory = note.category === 'work_to_consider' ? 'completed_work' : 'work_to_consider';

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/units/${unitId}/notes`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: note.id,
          category: nextCategory,
        }),
      });

      if (!response.ok) throw new Error('Could not update note.');
      await loadUnitDetail();
    } catch (toggleError) {
      console.error(toggleError);
    }
  };

  // Photo handlers
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !unitId) return;

    setUploadingPhoto(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const formData = new FormData();
      formData.append('file', file);
      if (photoCaption.trim()) {
        formData.append('caption', photoCaption.trim());
      }

      const response = await fetch(`/api/units/${unitId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not upload photo.');
      }

      setPhotoCaption('');
      await loadUnitDetail();
    } catch (pError) {
      console.error(pError);
      setError(pError instanceof Error ? pError.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    const confirm = window.confirm('Delete this unit photo?');
    if (!confirm || !unitId) return;

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/units/${unitId}/photos?photoId=${photoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Could not delete photo.');
      setSelectedPhotoModal(null);
      await loadUnitDetail();
    } catch (delError) {
      console.error(delError);
      setError(delError instanceof Error ? delError.message : 'Could not delete photo.');
    }
  };

  const handleMakePrimaryPhoto = async (photoId: string) => {
    if (!unitId) return;

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/units/${unitId}/photos`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ photoId }),
      });

      if (!response.ok) {
        const res = await response.json().catch(() => ({}));
        throw new Error(res?.error || 'Could not set primary photo.');
      }

      await loadUnitDetail();
    } catch (primaryError) {
      console.error(primaryError);
      setError(primaryError instanceof Error ? primaryError.message : 'Could not set primary photo.');
    }
  };

  // Unit Update handler
  const handleUpdateUnit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!unitId) return;

    setSavingUnitEdit(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) throw new Error('Sign in is required.');

      const payload: Record<string, unknown> = {
        unit_number: unitEditDraft.unit_number.trim(),
        bedrooms: Number(unitEditDraft.bedrooms) || 1,
        bathrooms: Number(unitEditDraft.bathrooms) || 1,
        square_feet: unitEditDraft.square_feet ? Number(unitEditDraft.square_feet) : null,
        status: unitEditDraft.status,
        notes: unitEditDraft.notes.trim() || null,
      };

      if (session?.role === 'owner') {
        payload.rent_amount = unitEditDraft.rent_amount ? Number(unitEditDraft.rent_amount) : null;
      }

      const response = await fetch(`/api/units/${unitId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Could not update unit.');

      setShowEditUnitModal(false);
      await loadUnitDetail();
    } catch (uError) {
      console.error(uError);
      setError(uError instanceof Error ? uError.message : 'Could not update unit.');
    } finally {
      setSavingUnitEdit(false);
    }
  };

  const filteredNotes = useMemo(() => {
    const list = unit?.unit_maintenance_notes ?? [];
    if (noteFilter === 'all') return list;
    return list.filter((n) => n.category === noteFilter);
  }, [unit, noteFilter]);

  if (!session) return null;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading unit details...
        </div>
      </main>
    );
  }

  if (error && !unit) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Unit not found
          </p>
          <p className="mt-3 text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => router.push(propertyId ? `/dashboard/properties/${propertyId}` : '/dashboard/properties')}
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            ← Back to Property
          </button>
        </div>
      </main>
    );
  }

  if (!unit) return null;

  const marketEstimate = calculateEstimatedMarketRent({
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    square_feet: unit.square_feet,
    address: unit.properties?.address,
    city: unit.properties?.city,
    state: unit.properties?.state,
    postal_code: unit.properties?.postal_code,
    current_rent: unit.rent_amount,
  });

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Navigation Breadcrumbs */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <button
              type="button"
              onClick={() => router.push('/dashboard/properties')}
              className="hover:text-slate-800"
            >
              Properties
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/properties/${unit.property_id}`)}
              className="hover:text-slate-800"
            >
              {unit.properties?.name || 'Property'}
            </button>
            <span>/</span>
            <span className="text-slate-800">Unit {unit.unit_number}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Maintenance Tickets
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard?propertyId=${unit.property_id}&unitId=${unit.id}`)}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              New Maintenance Ticket
            </button>
            <button
              type="button"
              onClick={() => setShowEditUnitModal(true)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit unit
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Unit Top Header Info Card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  Unit View
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                    unit.status === 'occupied'
                      ? 'bg-emerald-100 text-emerald-700'
                      : unit.status === 'vacant'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {unit.status}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Unit {unit.unit_number}
              </h1>
              <p className="mt-1 text-base text-slate-600">
                {unit.properties?.address}
                {(unit.properties?.city || unit.properties?.state || unit.properties?.postal_code) &&
                  `, ${[unit.properties.city, unit.properties.state, unit.properties.postal_code].filter(Boolean).join(' ')}`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {unit.bedrooms} Bedroom{unit.bedrooms === 1 ? '' : 's'} • {unit.bathrooms} Bathroom{unit.bathrooms === 1 ? '' : 's'}
                {unit.square_feet ? ` • ${unit.square_feet} sq ft` : ''}
              </p>
            </div>

            {/* Rent & Estimated Market Rent Section (Owner Only) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:min-w-[280px]">
              {session.role === 'owner' ? (
                <div>
                  <div className="grid grid-cols-2 gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Actual Rent
                      </p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {unit.rent_amount !== null && unit.rent_amount !== undefined
                          ? `$${Number(unit.rent_amount).toLocaleString()}/mo`
                          : 'Not set'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Est. Market Rent
                      </p>
                      <p className="mt-1 text-2xl font-bold text-indigo-700">
                        ~${marketEstimate.estimatedRent.toLocaleString()}/mo
                      </p>
                    </div>
                  </div>

                  {marketEstimate.difference && (
                    <div className="mt-2 text-xs">
                      <span
                        className={`font-semibold ${
                          marketEstimate.difference.isBelowMarket
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {marketEstimate.difference.label}
                      </span>
                    </div>
                  )}

                  {/* Zillow & Redfin comp links */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[11px]">
                    <span className="text-slate-500">Comps:</span>
                    <div className="flex gap-2">
                      <a
                        href={marketEstimate.compsUrls.zillow}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Zillow ↗
                      </a>
                      <span className="text-slate-300">•</span>
                      <a
                        href={marketEstimate.compsUrls.redfin}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-rose-600 hover:text-rose-800 hover:underline"
                      >
                        Redfin ↗
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-center">
                  <span className="inline-flex rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Rent Info Restricted (Owner only)
                  </span>
                </div>
              )}
            </div>
          </div>

          {unit.notes && (
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Unit notes: </span>
              {unit.notes}
            </div>
          )}
        </section>

        {/* 2-Column Layout: Left = Tenants & Photos, Right = Maintenance History & Linked Tickets */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1.3fr]">
          {/* Left Column */}
          <div className="space-y-8">
            {/* Tenants Section */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Tenants ({(unit.tenants ?? []).length})
                  </h2>
                  <p className="text-xs text-slate-500">Contact details and lease information</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTenant(null);
                    setTenantDraft(emptyTenantDraft);
                    setShowAddTenantModal(true);
                  }}
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  + Add tenant
                </button>
              </div>

              {(unit.tenants ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No tenants assigned to this unit yet.
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTenant(null);
                      setTenantDraft(emptyTenantDraft);
                      setShowAddTenantModal(true);
                    }}
                    className="mt-2 block w-full text-center text-xs font-semibold text-slate-900 underline"
                  >
                    Add resident / tenant
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {unit.tenants?.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{t.name}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                t.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {t.status}
                            </span>
                          </div>

                          <div className="mt-2 space-y-1 text-xs text-slate-600">
                            {t.email && (
                              <p>
                                ✉️{' '}
                                <a
                                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(t.email)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-900 underline hover:text-slate-700"
                                >
                                  {t.email}
                                </a>
                              </p>
                            )}
                            {t.phone && (
                              <p>
                                📞{' '}
                                <a
                                  href={`tel:${t.phone}`}
                                  className="text-slate-900 underline hover:text-slate-700"
                                >
                                  {t.phone}
                                </a>
                              </p>
                            )}
                            {(t.lease_start || t.lease_end) && (
                              <p className="text-slate-500">
                                📅 Lease: {t.lease_start ?? 'N/A'} to {t.lease_end ?? 'Present'}
                              </p>
                            )}
                            {t.emergency_contact && (
                              <p className="text-slate-500">
                                🚨 Emergency: {t.emergency_contact}
                              </p>
                            )}
                            {t.notes && <p className="italic text-slate-500">{t.notes}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTenant(t);
                              setTenantDraft({
                                name: t.name,
                                email: t.email ?? '',
                                phone: t.phone ?? '',
                                lease_start: t.lease_start ?? '',
                                lease_end: t.lease_end ?? '',
                                status: t.status ?? 'active',
                                emergency_contact: t.emergency_contact ?? '',
                                notes: t.notes ?? '',
                              });
                              setShowAddTenantModal(true);
                            }}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveTenant(t.id, t.name)}
                            className="text-xs font-medium text-rose-600 hover:text-rose-800"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Photos of Unit Section */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Unit Photos ({(unit.unit_photos ?? []).length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    JPG, PNG, WEBP, GIF • Max 10 MB per file
                  </p>
                </div>
                <label className="cursor-pointer rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 text-center">
                  {uploadingPhoto ? 'Uploading...' : '+ Upload photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/*"
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {(unit.unit_photos ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No photos uploaded for this unit yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {unit.unit_photos?.map((photo, idx) => {
                    const isPrimary = photo.is_primary || idx === 0;
                    const hasMultiple = (unit.unit_photos?.length ?? 0) > 1;

                    return (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhotoModal(photo)}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm transition hover:shadow-md"
                      >
                        <img
                          src={photo.photo_url}
                          alt={photo.caption || 'Unit photo'}
                          className="h-28 w-full object-cover transition group-hover:scale-105"
                        />

                        {/* Primary badge */}
                        {isPrimary && (
                          <div className="absolute top-1.5 left-1.5 rounded-md bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur-sm shadow-sm">
                            ⭐ Primary
                          </div>
                        )}

                        {/* Mouseover Make Primary Button when not primary and > 1 photos */}
                        {!isPrimary && hasMultiple && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleMakePrimaryPhoto(photo.id);
                            }}
                            className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-800 shadow hover:bg-slate-900 hover:text-white"
                            title="Set as primary photo"
                          >
                            ⭐ Make primary
                          </button>
                        )}

                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 p-1 text-[11px] text-white truncate px-2">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Maintenance History & Linked Tickets */}
          <div className="space-y-8">
            {/* Maintenance Notes & History Section */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Maintenance History</h2>
                  <p className="text-xs text-slate-500">
                    Detailed record of completed work & work to consider
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(emptyNoteDraft);
                    setShowAddNoteModal(true);
                  }}
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  + Add note / work
                </button>
              </div>

              {/* Filter Tabs for Notes */}
              <div className="mb-4 flex gap-2 border-b border-slate-100 pb-3">
                {[
                  { key: 'all' as const, label: 'All History' },
                  { key: 'completed_work' as const, label: '✅ Completed Work' },
                  { key: 'work_to_consider' as const, label: '💡 Work to Consider' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setNoteFilter(tab.key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      noteFilter === tab.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {filteredNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No maintenance records found for this view.
                </div>
              ) : (
                <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-0.5 before:bg-slate-200">
                  {filteredNotes.map((item) => {
                    const isCompleted = item.category === 'completed_work';
                    return (
                      <div key={item.id} className="relative flex items-start gap-4 pl-1">
                        {/* Status Icon Indicator */}
                        <button
                          type="button"
                          onClick={() => handleToggleNoteCategory(item)}
                          title="Click to toggle status"
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm transition ${
                            isCompleted
                              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                              : 'bg-amber-500 text-white hover:bg-amber-400'
                          }`}
                        >
                          {isCompleted ? '✓' : '💡'}
                        </button>

                        <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100/60">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isCompleted ? 'Completed Work' : 'Work to Consider'}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{item.performed_at || new Date(item.created_at).toLocaleDateString()}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(item.id)}
                                className="text-slate-400 hover:text-rose-600"
                                title="Delete note"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {item.note}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 border-t border-slate-200/60 pt-2">
                            {item.performed_by && (
                              <span>👤 <strong>By:</strong> {item.performed_by}</span>
                            )}
                            {item.cost !== null && item.cost !== undefined && (
                              <span className="font-semibold text-slate-700">
                                💵 <strong>Cost:</strong> ${Number(item.cost).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Related Tickets Section */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Linked Tickets ({tickets.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Maintenance requests filed for this unit & property
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View queue
                </button>
              </div>

              {tickets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No active or past tickets for this unit.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tickets.map((t) => {
                    const status = t.status || 'Open';
                    return (
                      <div
                        key={t.id}
                        onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                        className="cursor-pointer py-3.5 transition hover:bg-slate-50 px-2 rounded-xl"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-slate-900 hover:underline">
                                {t.title}
                              </h4>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  statusStyles[status] || statusStyles.Open
                                }`}
                              >
                                {status}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                              <span>Priority: {t.priority || 'Medium'}</span>
                              <span>•</span>
                              <span>Updated {new Date(t.updated_at).toLocaleDateString()}</span>
                              {t.assigned_to && (
                                <>
                                  <span>•</span>
                                  <span>Assigned: {t.assigned_to.split('<')[0].trim()}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-slate-400">→</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Add / Edit Tenant Modal */}
        {showAddTenantModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-slate-900">
                {editingTenant ? 'Edit Tenant' : 'Add Tenant to Unit ' + unit.unit_number}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Enter contact details, lease dates, and notes.
              </p>

              <form onSubmit={handleSaveTenant} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Tenant Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={tenantDraft.name}
                    onChange={(e) => setTenantDraft({ ...tenantDraft, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      placeholder="tenant@example.com"
                      value={tenantDraft.email}
                      onChange={(e) => setTenantDraft({ ...tenantDraft, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Phone</label>
                    <input
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={tenantDraft.phone}
                      onChange={(e) => setTenantDraft({ ...tenantDraft, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Lease Start Date
                    </label>
                    <input
                      type="date"
                      value={tenantDraft.lease_start}
                      onChange={(e) =>
                        setTenantDraft({ ...tenantDraft, lease_start: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Lease End Date
                    </label>
                    <input
                      type="date"
                      value={tenantDraft.lease_end}
                      onChange={(e) =>
                        setTenantDraft({ ...tenantDraft, lease_end: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                    <select
                      value={tenantDraft.status}
                      onChange={(e) => setTenantDraft({ ...tenantDraft, status: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="active">Active Resident</option>
                      <option value="past">Past Resident</option>
                      <option value="pending">Pending Move-in</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Emergency Contact
                    </label>
                    <input
                      type="text"
                      placeholder="Name & phone number"
                      value={tenantDraft.emergency_contact}
                      onChange={(e) =>
                        setTenantDraft({ ...tenantDraft, emergency_contact: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Parking spot, pets, lease details..."
                    value={tenantDraft.notes}
                    onChange={(e) => setTenantDraft({ ...tenantDraft, notes: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTenantModal(false);
                      setEditingTenant(null);
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTenant}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {savingTenant ? 'Saving...' : 'Save tenant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Maintenance Note / Work Modal */}
        {showAddNoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-slate-900">
                Add Maintenance Record for Unit {unit.unit_number}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Log completed work or list tasks to consider for future maintenance.
              </p>

              <form onSubmit={handleSaveNote} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Category *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNoteDraft({ ...noteDraft, category: 'completed_work' })}
                      className={`rounded-xl border p-3 text-left transition ${
                        noteDraft.category === 'completed_work'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm">✅ Completed Work</div>
                      <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                        Repair done, replacement, inspection passed
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteDraft({ ...noteDraft, category: 'work_to_consider' })}
                      className={`rounded-xl border p-3 text-left transition ${
                        noteDraft.category === 'work_to_consider'
                          ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold ring-1 ring-amber-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm">💡 Work to Consider</div>
                      <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                        Upcoming repair, aging appliance, quote needed
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Description of work / note *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="e.g. Replaced water heater with 50-gal Rheem unit; 6-year warranty."
                    value={noteDraft.note}
                    onChange={(e) => setNoteDraft({ ...noteDraft, note: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 450.00"
                      value={noteDraft.cost}
                      onChange={(e) => setNoteDraft({ ...noteDraft, cost: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Performed by
                    </label>
                    <input
                      type="text"
                      placeholder="Tech or vendor name"
                      value={noteDraft.performed_by}
                      onChange={(e) =>
                        setNoteDraft({ ...noteDraft, performed_by: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Date</label>
                    <input
                      type="date"
                      value={noteDraft.performed_at}
                      onChange={(e) =>
                        setNoteDraft({ ...noteDraft, performed_at: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddNoteModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingNote}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {savingNote ? 'Saving...' : 'Add record'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Unit Modal (Rent, SqFt, Notes, etc.) */}
        {showEditUnitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-slate-900">Edit Unit {unit.unit_number}</h2>

              <form onSubmit={handleUpdateUnit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Unit number / label *
                  </label>
                  <input
                    type="text"
                    required
                    value={unitEditDraft.unit_number}
                    onChange={(e) =>
                      setUnitEditDraft({ ...unitEditDraft, unit_number: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                {session.role === 'owner' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Monthly Rent ($) (Owner Only)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 2600"
                      value={unitEditDraft.rent_amount}
                      onChange={(e) =>
                        setUnitEditDraft({ ...unitEditDraft, rent_amount: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Bedrooms</label>
                    <input
                      type="number"
                      min="0"
                      value={unitEditDraft.bedrooms}
                      onChange={(e) =>
                        setUnitEditDraft({ ...unitEditDraft, bedrooms: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Bathrooms</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={unitEditDraft.bathrooms}
                      onChange={(e) =>
                        setUnitEditDraft({ ...unitEditDraft, bathrooms: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Sq Ft</label>
                    <input
                      type="number"
                      min="0"
                      value={unitEditDraft.square_feet}
                      onChange={(e) =>
                        setUnitEditDraft({ ...unitEditDraft, square_feet: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={unitEditDraft.status}
                    onChange={(e) =>
                      setUnitEditDraft({ ...unitEditDraft, status: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="occupied">Occupied</option>
                    <option value="vacant">Vacant</option>
                    <option value="maintenance">Under Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                  <textarea
                    rows={2}
                    value={unitEditDraft.notes}
                    onChange={(e) =>
                      setUnitEditDraft({ ...unitEditDraft, notes: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowEditUnitModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingUnitEdit}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {savingUnitEdit ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Full Image Lightbox Modal */}
        {selectedPhotoModal && (
          <div
            onClick={() => setSelectedPhotoModal(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <img
                src={selectedPhotoModal.photo_url}
                alt={selectedPhotoModal.caption || 'Unit photo'}
                className="max-h-[75vh] w-full object-contain bg-black"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800">
                    {selectedPhotoModal.caption || 'Unit photo'}
                  </p>
                  {unit.unit_photos?.[0]?.id === selectedPhotoModal.id && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      ⭐ Primary photo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(unit.unit_photos?.length ?? 0) > 1 &&
                    unit.unit_photos?.[0]?.id !== selectedPhotoModal.id && (
                      <button
                        type="button"
                        onClick={async () => {
                          await handleMakePrimaryPhoto(selectedPhotoModal.id);
                          setSelectedPhotoModal((curr) =>
                            curr ? { ...curr, is_primary: true } : curr,
                          );
                        }}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        ⭐ Make primary
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(selectedPhotoModal.id)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                  >
                    Delete photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPhotoModal(null)}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
