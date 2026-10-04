'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

import { fetchUserRole, type UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format-currency';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

type Property = { id: string; name: string; address: string };
type Unit = { id: string; unit_number: string; tenants?: Array<{ name: string }>; unit_photos?: Array<{ photo_url: string; is_primary?: boolean | null; created_at?: string }> };
type Lock = { id: string; unit_id: string | null; door: string; lock_group?: LockGroup | null; code: string; programming_code: string; photo_url: string | null };
type Garage = { id: string; unit_id: string | null; owner_assigned: boolean; garage_id: string; code: string; programming_code: string; garage_rent: number | null };
type PageData = { properties: Property[]; property: Property | null; units: Unit[]; locks: Lock[]; garages: Garage[]; canManageLocks: boolean; canManageGarages: boolean };
type LockGroup = 'entrance' | 'other' | 'gate';
type Editor = { kind: 'lock' | 'garage'; id: string | null; unitId: string | null; lockGroup: LockGroup | null };
type Draft = { door: string; otherDoor: string; code: string; programmingCode: string; garageId: string; garageRent: string; unitId: string; ownerAssigned: boolean };

const entranceDoors = ['Front Door', 'Back Door', 'Side Door'];
const otherLockTypes = ['Laundry Room', 'Trash Area', 'Utility Closet'];
const emptyDraft = (unitId: string | null, lockGroup: LockGroup = 'entrance'): Draft => ({ door: lockGroup === 'other' ? otherLockTypes[0] : entranceDoors[0], otherDoor: '', code: '', programmingCode: '', garageId: '', garageRent: '', unitId: unitId ?? '', ownerAssigned: false });
const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600';
const isGateLock = (lock: Lock) => lock.lock_group ? lock.lock_group === 'gate' : /\bgates?\b/i.test(lock.door.trim());
const getUnitLabel = (unit: Unit) => {
  const tenantNames = unit.tenants?.map((tenant) => tenant.name.trim()).filter(Boolean) ?? [];
  return `Unit ${unit.unit_number}${tenantNames.length ? ` · ${tenantNames.join(', ')}` : ''}`;
};

export default function DoorCodesPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [propertyId, setPropertyId] = useState('');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(null));
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  async function load(selectedPropertyId: string) {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error('Sign in is required.');
    const response = await fetch(`/api/door-codes${selectedPropertyId ? `?propertyId=${encodeURIComponent(selectedPropertyId)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Door codes could not be loaded.');
    setData(result);
    return result as PageData;
  }

  useEffect(() => {
    void (async () => {
      try {
        const sessionUser = (await supabase?.auth.getSession())?.data.session?.user;
        if (sessionUser) setUserRole(await fetchUserRole(sessionUser.email, supabase));
        const overview = await load('');
        if (overview.property) {
          setPropertyId(overview.property.id);
        } else if (overview.properties.length) {
          setPropertyId(overview.properties[0].id);
          await load(overview.properties[0].id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Door codes could not be loaded.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function startLock(unitId: string | null, lockGroup: LockGroup, lock?: Lock) {
    setError('');
    const options = lockGroup === 'other' ? otherLockTypes : entranceDoors;
    const selectedDoor = options.find((option) => option.toLowerCase() === lock?.door.toLowerCase());
    const gateName = lock?.door ?? `Gate ${(data?.locks.filter(isGateLock).length ?? 0) + 1}`;
    const recordUnitId = lockGroup === 'gate' ? null : unitId;
    setEditor({ kind: 'lock', id: lock?.id ?? null, unitId: recordUnitId, lockGroup });
    setDraft({ ...emptyDraft(recordUnitId, lockGroup), door: lockGroup === 'gate' ? gateName : lock ? selectedDoor ?? 'Other' : lockGroup === 'other' ? otherLockTypes[0] : entranceDoors[0], otherDoor: lockGroup === 'gate' || selectedDoor || !lock ? '' : lock.door, code: lock?.code ?? '', programmingCode: lock?.programming_code ?? '' });
  }

  function startGarage(garage?: Garage) {
    setError('');
    setEditor({ kind: 'garage', id: garage?.id ?? null, unitId: garage?.unit_id ?? null, lockGroup: null });
    setDraft({ ...emptyDraft(garage?.unit_id ?? null), ownerAssigned: garage?.owner_assigned ?? false, garageId: garage?.garage_id ?? '', garageRent: garage?.garage_rent?.toString() ?? '', code: garage?.code ?? '', programmingCode: garage?.programming_code ?? '' });
  }

  async function send(method: 'POST' | 'PATCH' | 'DELETE', kind: 'lock' | 'garage', id: string | null, payload?: Draft, lockGroup = editor?.lockGroup) {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error('Sign in is required.');
    const params = new URLSearchParams();
    if (id) params.set('id', id);
    if (method === 'DELETE') {
      params.set('kind', kind);
      params.set('propertyId', propertyId);
    }
    const response = await fetch(`/api/door-codes${params.size ? `?${params}` : ''}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify({ propertyId, kind, lockGroup, unitId: payload.unitId || null, ownerAssigned: payload.ownerAssigned, door: payload.door === 'Other' ? payload.otherDoor : payload.door, code: payload.code, programmingCode: payload.programmingCode, garageId: payload.garageId, garageRent: payload.garageRent }) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Changes could not be saved.');
    await load(propertyId);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError('');
    try {
      await send(editor.id ? 'PATCH' : 'POST', editor.kind, editor.id, draft);
      setEditor(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Changes could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function moveToGates(lock: Lock) {
    setSaving(true);
    setError('');
    try {
      const payload = { ...emptyDraft(null, 'gate'), door: lock.door, code: lock.code, programmingCode: lock.programming_code };
      await send('PATCH', 'lock', lock.id, payload, 'gate');
      setEditor(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Lock could not be moved to Gates.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLockPhoto(lockId: string, file: File | undefined) {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/door-codes/${lockId}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Photo could not be uploaded.');
      await load(propertyId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Photo could not be uploaded.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: 'lock' | 'garage', id: string) {
    if (!window.confirm(`Remove this ${kind}?`)) return;
    setSaving(true);
    setError('');
    try {
      await send('DELETE', kind, id);
      setEditor(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Entry could not be removed.');
    } finally {
      setSaving(false);
    }
  }

  const codeFields = (entry: { id: string; code: string; programming_code: string }) => (
    (data?.canManageLocks ? ['code', 'programming_code'] as const : ['code'] as const).map((field) => (
      <div key={field} className="mt-2 flex min-w-0 items-center gap-2">
        <span className="w-32 shrink-0 text-xs text-slate-500">{field === 'code' ? 'Access code' : 'Programming code'}</span>
        <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono">{revealed[`${entry.id}-${field}`] ? entry[field] || 'Not set' : entry[field] ? '••••••' : 'Not set'}</span>
        <button type="button" title={revealed[`${entry.id}-${field}`] ? 'Hide code' : 'Show code'} aria-label={revealed[`${entry.id}-${field}`] ? 'Hide code' : 'Show code'} onClick={() => setRevealed((current) => ({ ...current, [`${entry.id}-${field}`]: !current[`${entry.id}-${field}`] }))} className="text-slate-500">{revealed[`${entry.id}-${field}`] ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </div>
    ))
  );

  const lockForm = (unitId: string | null, lockGroup: LockGroup) => data?.canManageLocks && editor?.kind === 'lock' && editor.unitId === unitId && editor.lockGroup === lockGroup ? (
    <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 rounded-md border border-teal-200 bg-teal-50/50 p-4 sm:grid-cols-3">
      {lockGroup === 'gate' ? <label className="text-xs font-semibold text-slate-600">Gate name<input className={`mt-1 ${inputClass}`} required maxLength={100} value={draft.door} onChange={(event) => setDraft({ ...draft, door: event.target.value })} /></label> : <label className="text-xs font-semibold text-slate-600">{lockGroup === 'other' ? 'Lock type' : 'Door'}<select className={`mt-1 ${inputClass}`} required value={draft.door} onChange={(event) => setDraft({ ...draft, door: event.target.value, otherDoor: event.target.value === 'Other' ? draft.otherDoor : '' })}>{(lockGroup === 'other' ? otherLockTypes : entranceDoors).map((option) => <option key={option} value={option}>{option}</option>)}<option value="Other">Other (fill in blank)</option></select></label>}
      {lockGroup !== 'gate' && draft.door === 'Other' && <label className="text-xs font-semibold text-slate-600">{lockGroup === 'other' ? 'Other lock name' : 'Other door name'}<input className={`mt-1 ${inputClass}`} required maxLength={100} value={draft.otherDoor} onChange={(event) => setDraft({ ...draft, otherDoor: event.target.value })} /></label>}
      <label className="text-xs font-semibold text-slate-600">Code<input className={`mt-1 ${inputClass}`} maxLength={100} autoComplete="off" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
      <label className="text-xs font-semibold text-slate-600">Programming Code<input className={`mt-1 ${inputClass}`} maxLength={100} autoComplete="off" value={draft.programmingCode} onChange={(event) => setDraft({ ...draft, programmingCode: event.target.value })} /></label>
      <div className="flex gap-2 sm:col-span-3"><button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save lock'}</button><button type="button" onClick={() => setEditor(null)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm">Cancel</button></div>
    </form>
  ) : null;

  const lockSection = (title: string, unitId: string | null, lockGroup: LockGroup, unitPhotoUrl: string | null = null) => {
    const locks = data?.locks.filter((lock) => {
      if (lockGroup === 'gate') return isGateLock(lock);
      if (lock.unit_id !== unitId || isGateLock(lock)) return false;
      if (unitId !== null) return true;
      return lockGroup === 'entrance' ? entranceDoors.some((option) => option.toLowerCase() === lock.door.toLowerCase()) : true;
    }) ?? [];
    return (
      <section key={unitId ?? lockGroup} className="border-b border-slate-200 py-5 last:border-0">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{unitId !== null && (unitPhotoUrl ? <Image src={unitPhotoUrl} alt={`${title} thumbnail`} width={56} height={56} unoptimized className="size-14 shrink-0 rounded-md border border-slate-200 object-cover" /> : <div aria-hidden="true" className="size-14 shrink-0 rounded-md border border-slate-200 bg-slate-100" />)}<h3 className="font-semibold text-slate-900">{title}</h3></div>{data?.canManageLocks && <button type="button" onClick={() => startLock(unitId, lockGroup)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"><Plus size={15} />{lockGroup === 'gate' ? 'Add Gate' : 'Add Lock'}</button>}</div>
        {locks.length === 0 ? <p className="mt-3 text-sm text-slate-500">No Locks Added</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{locks.map((lock) => (
            <div key={lock.id} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{lock.door}</p>{data?.canManageLocks && <div className="flex gap-2"><button type="button" onClick={() => startLock(unitId, lockGroup, lock)} className="text-xs font-medium text-teal-800 underline">Edit</button><button type="button" disabled={saving} onClick={() => void remove('lock', lock.id)} title="Remove lock" aria-label={`Remove ${lock.door}`} className="text-rose-700"><Trash2 size={16} /></button></div>}</div>
              {lock.unit_id === null && <div className="mt-3 flex flex-wrap items-center gap-3">{lock.photo_url && <Image src={lock.photo_url} alt={`${lock.door} lock`} width={64} height={64} unoptimized className="size-16 rounded-md border border-slate-200 object-cover" />}{data?.canManageLocks && <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">{lock.photo_url ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" className="sr-only" disabled={saving} onChange={(event) => { void uploadLockPhoto(lock.id, event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>}</div>}
              {codeFields(lock)}
              {data?.canManageLocks && lockGroup === 'other' && lock.unit_id === null && <button type="button" disabled={saving} onClick={() => void moveToGates(lock)} className="mt-3 text-xs font-medium text-teal-800 underline disabled:opacity-50">Move to Gates</button>}
            </div>
          ))}</div>}
        {lockForm(unitId, lockGroup)}
      </section>
    );
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Door Codes', href: '/dashboard/door-codes' }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Door Codes</h1><p className="mt-1 text-sm text-slate-600">Locks and garage assignments by property</p></div></div>
        {userRole && <div className="mt-4 flex flex-wrap gap-2"><DashboardNavButtons current="door-codes" role={userRole} propertyId={propertyId} /></div>}
        {error && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <p className="mt-6 text-sm text-slate-500">Loading...</p> : data && (
          <>
            <label className="mt-6 block max-w-sm text-sm font-medium">Property
              <select className={`mt-1 ${inputClass}`} value={propertyId} onChange={(event) => { const nextId = event.target.value; setPropertyId(nextId); setEditor(null); setError(''); void load(nextId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Property could not be loaded.')); }}>
                {data.properties.length === 0 && <option value="">No properties found</option>}
                {data.properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}
              </select>
            </label>
            {data.property && (
              <>
                <section className="mt-7 border-t border-slate-300 bg-white px-5 py-2 sm:px-6">
                  <h2 className="pt-4 text-lg font-semibold">Doors & Locks</h2>
                  {lockSection('Other Locks', null, 'other')}
                  {lockSection('Gates', null, 'gate')}
                  {data.units.map((unit) => lockSection(getUnitLabel(unit), unit.id, 'entrance', unit.unit_photos?.[0]?.photo_url ?? null))}
                </section>
                <section className="mt-7 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Garage Codes</h2><p className="text-sm text-slate-500">Each garage can be assigned to one unit; units may have multiple garages.</p></div>{data.canManageGarages && <button type="button" onClick={() => startGarage()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Plus size={16} />Add Garage</button>}</div>
                  <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                    {data.garages.length === 0 && <p className="py-6 text-sm text-slate-500">No garages yet.</p>}
                    {data.garages.map((garage) => { const assignedUnit = data.units.find((unit) => unit.id === garage.unit_id); const assignmentLabel = assignedUnit ? getUnitLabel(assignedUnit) : garage.owner_assigned ? 'Owner' : 'Unassigned'; return <div key={garage.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold">{garage.garage_id}</p><p className="text-slate-600">{assignmentLabel}{data.canManageGarages && garage.garage_rent !== null ? ` · ${formatCurrency(Number(garage.garage_rent))}/mo` : ''}</p>{codeFields(garage)}</div>{data.canManageGarages && <div className="flex gap-3"><button type="button" onClick={() => startGarage(garage)} className="font-medium text-teal-800 underline">Edit</button><button type="button" disabled={saving} onClick={() => void remove('garage', garage.id)} aria-label={`Remove ${garage.garage_id}`} className="text-rose-700"><Trash2 size={16} /></button></div>}</div>; })}
                  </div>
                  {editor?.kind === 'garage' && <form onSubmit={(event) => void save(event)} className="mt-4 grid gap-3 rounded-md border border-teal-200 bg-teal-50/50 p-4 sm:grid-cols-3">
                    <label className="text-xs font-semibold text-slate-600">Garage ID<input required maxLength={100} className={`mt-1 ${inputClass}`} value={draft.garageId} onChange={(event) => setDraft({ ...draft, garageId: event.target.value })} placeholder="Trash Garage" /></label>
                    <label className="text-xs font-semibold text-slate-600">Assigned to<select className={`mt-1 ${inputClass}`} value={draft.ownerAssigned ? 'owner' : draft.unitId} onChange={(event) => setDraft({ ...draft, ownerAssigned: event.target.value === 'owner', unitId: event.target.value === 'owner' ? '' : event.target.value })}><option value="">Unassigned</option><option value="owner">Owner</option>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{getUnitLabel(unit)}</option>)}</select></label>
                    <label className="text-xs font-semibold text-slate-600">Garage rent ($/month)<input type="number" min="0" step="0.01" className={`mt-1 ${inputClass}`} value={draft.garageRent} onChange={(event) => setDraft({ ...draft, garageRent: event.target.value })} placeholder="Optional" /></label>
                    <label className="text-xs font-semibold text-slate-600">Access code<input className={`mt-1 ${inputClass}`} maxLength={100} autoComplete="off" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
                    <label className="text-xs font-semibold text-slate-600">Programming Code<input className={`mt-1 ${inputClass}`} maxLength={100} autoComplete="off" value={draft.programmingCode} onChange={(event) => setDraft({ ...draft, programmingCode: event.target.value })} /></label>
                    <div className="flex gap-2 sm:col-span-3"><button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save garage'}</button><button type="button" onClick={() => setEditor(null)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm">Cancel</button></div>
                  </form>}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}