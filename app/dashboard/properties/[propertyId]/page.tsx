'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { calculateEstimatedMarketRent } from '@/lib/market-rent';
import { getUnitTotalRent } from '@/lib/rent';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../../breadcrumbs';
import { DashboardNavButtons } from '../../nav-buttons';


type TenantSummary = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
};

type UnitDetail = {
  id: string;
  property_id: string;
  unit_number: string;
  rent_amount?: number | null;
  has_garage?: boolean | null;
  garage_rent?: number | null;
  bedrooms: number;
  bathrooms: number;
  square_feet?: number | null;
  status: string;
  notes?: string | null;
  tenants?: TenantSummary[];
  unit_photos?: Array<{ id: string; photo_url: string; caption?: string | null; is_primary?: boolean | null }>;
  unit_maintenance_notes?: Array<{ id: string; note: string; category: string }>;
};

type PropertyIncomeSource = {
  id: string;
  label: string;
  amount: number;
  created_at: string;
};

type PropertyWithUnits = {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  created_at: string;
  units?: UnitDetail[];
  property_income_sources?: PropertyIncomeSource[];
};

type MaintenanceStaff = {
  id: string;
  name: string;
  email: string;
  phone_number?: string | null;
  avatar_url?: string | null;
};

type PropertyAssignment = {
  assignment_type: 'primary' | 'secondary';
  staff_members: MaintenanceStaff;
};

type UnitDraft = {
  unit_number: string;
  rent_amount: string;
  bedrooms: string;
  bathrooms: string;
  square_feet: string;
  status: string;
  notes: string;
};

const emptyUnitDraft: UnitDraft = {
  unit_number: '',
  rent_amount: '',
  bedrooms: '1',
  bathrooms: '1',
  square_feet: '',
  status: 'occupied',
  notes: '',
};

export default function PropertyDetailPage() {
  const router = useRouter();
  const params = useParams<{ propertyId: string }>();
  const propertyId = params?.propertyId;

  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [property, setProperty] = useState<PropertyWithUnits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(emptyUnitDraft);
  const [savingUnit, setSavingUnit] = useState(false);
  const [showEditPropertyModal, setShowEditPropertyModal] = useState(false);
  const [propEditDraft, setPropEditDraft] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    notes: '',
    primary_staff_id: '',
    secondary_staff_id: '',
  });
  const [savingProp, setSavingProp] = useState(false);
  const [maintenanceStaff, setMaintenanceStaff] = useState<MaintenanceStaff[]>([]);
  const [propertyAssignments, setPropertyAssignments] = useState<PropertyAssignment[]>([]);
  const [newIncomeLabel, setNewIncomeLabel] = useState('Laundry');
  const [newIncomeAmount, setNewIncomeAmount] = useState('');
  const [savingIncome, setSavingIncome] = useState(false);

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

  const loadProperty = async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch(`/api/properties/${propertyId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to load property details.');
      }

      const propData = result.property as PropertyWithUnits | null;
      setProperty(propData);
      setMaintenanceStaff(Array.isArray(result.maintenanceStaff) ? result.maintenanceStaff : []);
      setPropertyAssignments(Array.isArray(result.assignments) ? result.assignments : []);
      if (propData) {
        const primary = result.assignments?.find((assignment: PropertyAssignment) => assignment.assignment_type === 'primary')?.staff_members?.id ?? '';
        const secondary = result.assignments?.find((assignment: PropertyAssignment) => assignment.assignment_type === 'secondary')?.staff_members?.id ?? '';
        setPropEditDraft({
          name: propData.name ?? '',
          address: propData.address ?? '',
          city: propData.city ?? '',
          state: propData.state ?? '',
          postal_code: propData.postal_code ?? '',
          notes: propData.notes ?? '',
          primary_staff_id: primary,
          secondary_staff_id: secondary,
        });
      }
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load property details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && session.role !== 'tenant' && propertyId) {
      void loadProperty();
    }
  }, [session, propertyId]);

  const handleAddIncome = async () => {
    if (!propertyId) return;
    const label = newIncomeLabel.trim();
    if (!label) {
      setError('An income label is required.');
      return;
    }

    setSavingIncome(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/properties/${propertyId}/income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ label, amount: newIncomeAmount ? Number(newIncomeAmount) : 0 }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Income source could not be saved.');

      setNewIncomeLabel('Laundry');
      setNewIncomeAmount('');
      await loadProperty();
    } catch (incomeError) {
      console.error(incomeError);
      setError(incomeError instanceof Error ? incomeError.message : 'Income source could not be saved.');
    } finally {
      setSavingIncome(false);
    }
  };

  const handleRemoveIncome = async (incomeId: string) => {
    if (!propertyId || !window.confirm('Remove this income source?')) return;

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error('Sign in is required.');

      const response = await fetch(`/api/properties/${propertyId}/income?incomeId=${incomeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Income source could not be removed.');
      await loadProperty();
    } catch (incomeError) {
      console.error(incomeError);
      setError(incomeError instanceof Error ? incomeError.message : 'Income source could not be removed.');
    }
  };

  const handleCreateUnit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!unitDraft.unit_number.trim() || !propertyId) {
      setError('Unit number is required.');
      return;
    }

    setSavingUnit(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          property_id: propertyId,
          unit_number: unitDraft.unit_number.trim(),
          rent_amount: unitDraft.rent_amount ? Number(unitDraft.rent_amount) : null,
          bedrooms: Number(unitDraft.bedrooms) || 1,
          bathrooms: Number(unitDraft.bathrooms) || 1,
          square_feet: unitDraft.square_feet ? Number(unitDraft.square_feet) : null,
          status: unitDraft.status,
          notes: unitDraft.notes.trim() || null,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not create unit.');
      }

      setUnitDraft(emptyUnitDraft);
      setShowAddUnitModal(false);
      await loadProperty();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Could not create unit.');
    } finally {
      setSavingUnit(false);
    }
  };

  const handleUpdateProperty = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!propertyId) return;

    setSavingProp(true);
    setError(null);

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(propEditDraft),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not update property.');
      }

      setShowEditPropertyModal(false);
      await loadProperty();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Could not update property.');
    } finally {
      setSavingProp(false);
    }
  };

  const handleDeleteProperty = async () => {
    if (!propertyId || !session || (session.role !== 'owner' && session.role !== 'manager')) return;

    const confirm = window.confirm(
      'Are you sure you want to delete this property and all associated units? This cannot be undone.',
    );
    if (!confirm) return;

    try {
      const { data: authData } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || 'Could not delete property.');
      }

      router.push('/dashboard/properties');
    } catch (delError) {
      console.error(delError);
      setError(delError instanceof Error ? delError.message : 'Could not delete property.');
    }
  };

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading property details...
        </div>
      </main>
    );
  }

  if (error && !property) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Property not found
          </p>
          <p className="mt-3 text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/properties')}
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            ← Back to Properties
          </button>
        </div>
      </main>
    );
  }

  if (!property) return null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Properties & Units', href: '/dashboard/properties' },
              { label: property.name || property.address, href: `/dashboard/properties/${propertyId}` },
            ]}
          />

          <div className="flex flex-wrap items-center gap-3">
            <DashboardNavButtons current="properties" role={session.role} />
            <button
              type="button"
              onClick={() => setShowEditPropertyModal(true)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit property
            </button>
            {(session.role === 'owner' || session.role === 'manager') && (
              <button
                type="button"
                onClick={handleDeleteProperty}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                Delete property
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Property Overview Header Card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Property Details
              </span>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                {property.name}
              </h1>
              <p className="mt-1 text-base text-slate-600">{property.address}</p>
              {(property.city || property.state || property.postal_code) && (
                <p className="text-sm text-slate-500">
                  {[property.city, property.state, property.postal_code].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Units
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {property.units?.length ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Tenants
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {(property.units ?? []).reduce((sum, u) => sum + (u.tenants?.length ?? 0), 0)}
                </p>
              </div>
              {(session.role === 'owner' || session.role === 'manager') && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Total Rent</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-900">
                    ${(property.units ?? []).reduce((sum, unit) => sum + getUnitTotalRent(unit), 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-emerald-700">per month</p>
                </div>
              )}
            </div>
          </div>

          {property.notes && (
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Property Notes
              </p>
              <p className="mt-1 text-sm text-slate-700">{property.notes}</p>
            </div>
          )}

          {(session.role === 'owner' || session.role === 'manager') && (
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Estimated Additional Income
              </p>
              {(property.property_income_sources ?? []).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {(property.property_income_sources ?? []).map((income) => (
                    <li key={income.id} className="flex items-center justify-between text-sm text-slate-700">
                      <span>{income.label}: ${Number(income.amount).toLocaleString()}/mo</span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveIncome(income.id)}
                        className="text-xs font-medium text-rose-700 hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Label (e.g. Laundry)"
                  value={newIncomeLabel}
                  onChange={(e) => setNewIncomeLabel(e.target.value)}
                  className="w-40 rounded-xl border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-slate-500"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount / mo"
                  value={newIncomeAmount}
                  onChange={(e) => setNewIncomeAmount(e.target.value)}
                  className="w-28 rounded-xl border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-slate-500"
                />
                <button
                  type="button"
                  onClick={() => void handleAddIncome()}
                  disabled={savingIncome}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {savingIncome ? 'Adding...' : 'Add Income'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(['primary', 'secondary'] as const).map((assignmentType) => {
              const contact = propertyAssignments.find((assignment) => assignment.assignment_type === assignmentType)?.staff_members;
              return (
                <div key={assignmentType} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  {contact ? (
                    <>
                      <img
                        src={contact.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=0f766e&color=fff`}
                        alt={`${contact.name} avatar`}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          {assignmentType === 'primary' ? 'Primary Maintenance contact' : 'Secondary Maintenance contact'}
                        </p>
                        <p className="mt-1 font-semibold text-emerald-950">{contact.name}</p>
                        {contact.phone_number && <p className="text-sm text-emerald-800">{contact.phone_number}</p>}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-emerald-800">
                      <p>
                        {assignmentType === 'primary' ? 'No primary maintenance contact assigned.' : 'No secondary maintenance contact assigned.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowEditPropertyModal(true)}
                        className="mt-1 font-semibold underline hover:text-emerald-900"
                      >
                        Edit Property
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Units List Section */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Units at this property</h2>
              <p className="text-sm text-slate-500">
                Click any unit to view photos, tenants, rent comparison, and maintenance history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddUnitModal(true)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + Add unit
            </button>
          </div>

          {(property.units?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <h3 className="text-base font-semibold text-slate-900">No units added yet</h3>
              <p className="mt-2 text-sm text-slate-500">
                Add units (e.g. Unit 1, Apt A, Main House) to manage tenants, rent, and maintenance
                records.
              </p>
              <button
                type="button"
                onClick={() => setShowAddUnitModal(true)}
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                + Add unit
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(property.units ?? []).map((unit) => {
                const tenantCount = unit.tenants?.length ?? 0;
                const photoCount = unit.unit_photos?.length ?? 0;
                const noteCount = unit.unit_maintenance_notes?.length ?? 0;
                const unitThumbnail = unit.unit_photos?.[0]?.photo_url;

                // Market Rent Estimate calculation
                const marketComp = calculateEstimatedMarketRent({
                  bedrooms: unit.bedrooms,
                  bathrooms: unit.bathrooms,
                  square_feet: unit.square_feet,
                  address: property.address,
                  city: property.city,
                  state: property.state,
                  postal_code: property.postal_code,
                  current_rent: unit.rent_amount,
                });

                return (
                  <div
                    key={unit.id}
                    onClick={() =>
                      router.push(`/dashboard/properties/${property.id}/units/${unit.id}`)
                    }
                    className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-400 hover:shadow-md flex flex-col"
                  >
                    {/* Unit Thumbnail Banner */}
                    {unitThumbnail ? (
                      <div className="relative h-40 w-full overflow-hidden bg-slate-100">
                        <img
                          src={unitThumbnail}
                          alt={`Unit ${unit.unit_number}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        <div className="absolute top-2 right-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                          📷 {photoCount} photo{photoCount === 1 ? '' : 's'}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-2xl text-slate-300">
                        🚪
                      </div>
                    )}

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">
                              Unit {unit.unit_number}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {unit.bedrooms} bed • {unit.bathrooms} bath
                              {unit.square_feet ? ` • ${unit.square_feet} sq ft` : ''}
                            </p>
                          </div>
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

                        {/* Rent & Estimated Market Rent (Owner only) */}
                        {(session.role === 'owner' || session.role === 'manager') && (
                          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[11px] font-medium text-slate-500">Actual Rent</p>
                                <p className="text-sm font-bold text-slate-900">
                                  {unit.rent_amount !== null && unit.rent_amount !== undefined
                                    ? `$${getUnitTotalRent(unit).toLocaleString()}/mo`
                                    : 'Not set'}
                                </p>
                                {unit.has_garage && unit.garage_rent ? (
                                  <p className="text-[10px] text-slate-500">
                                    Includes garage rent of ${Number(unit.garage_rent).toLocaleString()}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-slate-500">Est. Market Rent</p>
                                <p className="text-sm font-bold text-indigo-700">
                                  ~${marketComp.estimatedRent.toLocaleString()}/mo
                                </p>
                              </div>
                            </div>
                            {marketComp.difference && (
                              <div className="mt-2 text-[11px]">
                                <span
                                  className={`font-semibold ${
                                    marketComp.difference.isBelowMarket
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {marketComp.difference.label}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tenants */}
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Tenants ({tenantCount})
                          </p>
                          {tenantCount === 0 ? (
                            <p className="mt-1 text-xs text-slate-400">No tenants assigned</p>
                          ) : (
                            <div className="mt-1 space-y-1">
                              {unit.tenants?.map((t) => (
                                <p key={t.id} className="text-sm font-medium text-slate-800">
                                  {t.name}{' '}
                                  {t.phone && (
                                    <span className="text-xs text-slate-500">({t.phone})</span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Maintenance badge */}
                      <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>🔧 {noteCount} maintenance record{noteCount === 1 ? '' : 's'}</span>
                        <span className="font-medium text-slate-700 hover:text-slate-900">View unit →</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Add Unit Modal */}
        {showAddUnitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-slate-900">Add unit to {property.name}</h2>

              <form onSubmit={handleCreateUnit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Unit number / label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Unit 1, Apt 4B, Suite B, or Main"
                    value={unitDraft.unit_number}
                    onChange={(e) => setUnitDraft({ ...unitDraft, unit_number: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                {(session.role === 'owner' || session.role === 'manager') && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Monthly rent ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 2500"
                      value={unitDraft.rent_amount}
                      onChange={(e) => setUnitDraft({ ...unitDraft, rent_amount: e.target.value })}
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
                      value={unitDraft.bedrooms}
                      onChange={(e) => setUnitDraft({ ...unitDraft, bedrooms: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Bathrooms</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={unitDraft.bathrooms}
                      onChange={(e) => setUnitDraft({ ...unitDraft, bathrooms: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Sq Ft</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="850"
                      value={unitDraft.square_feet}
                      onChange={(e) => setUnitDraft({ ...unitDraft, square_feet: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={unitDraft.status}
                    onChange={(e) => setUnitDraft({ ...unitDraft, status: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="occupied">Occupied</option>
                    <option value="vacant">Vacant</option>
                    <option value="maintenance">Under Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Key codes, appliance serials, etc."
                    value={unitDraft.notes}
                    onChange={(e) => setUnitDraft({ ...unitDraft, notes: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Primary Maintenance Contact
                    <select
                      value={propEditDraft.primary_staff_id}
                      onChange={(event) => setPropEditDraft({ ...propEditDraft, primary_staff_id: event.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">None assigned</option>
                      {maintenanceStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name} {member.phone_number ? `(${member.phone_number})` : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Secondary Maintenance Contact
                    <select
                      value={propEditDraft.secondary_staff_id}
                      onChange={(event) => setPropEditDraft({ ...propEditDraft, secondary_staff_id: event.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">None assigned</option>
                      {maintenanceStaff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name} {member.phone_number ? `(${member.phone_number})` : ''}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddUnitModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingUnit}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {savingUnit ? 'Adding...' : 'Add unit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Property Modal */}
        {showEditPropertyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-slate-900">Edit property details</h2>

              <form onSubmit={handleUpdateProperty} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Property name *
                  </label>
                  <input
                    type="text"
                    required
                    value={propEditDraft.name}
                    onChange={(e) =>
                      setPropEditDraft({ ...propEditDraft, name: e.target.value })
                    }
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
                    value={propEditDraft.address}
                    onChange={(e) =>
                      setPropEditDraft({ ...propEditDraft, address: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">City</label>
                    <input
                      type="text"
                      value={propEditDraft.city}
                      onChange={(e) =>
                        setPropEditDraft({ ...propEditDraft, city: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">State</label>
                    <input
                      type="text"
                      value={propEditDraft.state}
                      onChange={(e) =>
                        setPropEditDraft({ ...propEditDraft, state: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Zip</label>
                    <input
                      type="text"
                      value={propEditDraft.postal_code}
                      onChange={(e) =>
                        setPropEditDraft({ ...propEditDraft, postal_code: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    rows={3}
                    value={propEditDraft.notes}
                    onChange={(e) =>
                      setPropEditDraft({ ...propEditDraft, notes: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Primary maintenance contact
                    </label>
                    <select
                      value={propEditDraft.primary_staff_id}
                      onChange={(e) =>
                        setPropEditDraft({ ...propEditDraft, primary_staff_id: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="">None</option>
                      {maintenanceStaff.map((staffMember) => (
                        <option key={staffMember.id} value={staffMember.id}>
                          {staffMember.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Secondary maintenance contact
                    </label>
                    <select
                      value={propEditDraft.secondary_staff_id}
                      onChange={(e) =>
                        setPropEditDraft({ ...propEditDraft, secondary_staff_id: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="">None</option>
                      {maintenanceStaff.map((staffMember) => (
                        <option key={staffMember.id} value={staffMember.id}>
                          {staffMember.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowEditPropertyModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProp}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {savingProp ? 'Saving...' : 'Save changes'}
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
