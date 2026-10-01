'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';

type Property = { id: string; name: string; address: string };
type Unit = { id: string; unit_number: string };
type Lock = { id: string; unit_id: string | null; door: string; code: string; programming_code: string };
type Garage = { id: string; unit_id: string | null; garage_id: string; code: string; programming_code: string; garage_rent: number | null };
type PageData = { properties: Property[]; property: Property | null; units: Unit[]; locks: Lock[]; garages: Garage[]; canManageGarages: boolean };
type Editor = { kind: 'lock' | 'garage'; id: string | null; unitId: string | null };
type Draft = { door: string; code: string; programmingCode: string; garageId: string; garageRent: string; unitId: string };

const emptyDraft = (unitId: string | null): Draft => ({ door: '', code: '', programmingCode: '', garageId: '', garageRent: '', unitId: unitId ?? '' });
const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600';

export default function DoorCodesPage() {
  const router = useRouter();
  const [data, setData] = useState<PageData | null>(null);
  const [propertyId, setPropertyId] = useState('');
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
        const overview = await load('');
        if (overview.properties.length) {
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

  function startLock(unitId: string | null, lock?: Lock) {
    setError('');
    setEditor({ kind: 'lock', id: lock?.id ?? null, unitId });
    setDraft({ ...emptyDraft(unitId), door: lock?.door ?? '', code: lock?.code ?? '', programmingCode: lock?.programming_code ?? '' });
  }

  function startGarage(garage?: Garage) {
    setError('');
    setEditor({ kind: 'garage', id: garage?.id ?? null, unitId: garage?.unit_id ?? null });
    setDraft({ ...emptyDraft(garage?.unit_id ?? null), garageId: garage?.garage_id ?? '', garageRent: garage?.garage_rent?.toString() ?? '', code: garage?.code ?? '', programmingCode: garage?.programming_code ?? '' });
  }

  async function send(method: 'POST' | 'PATCH' | 'DELETE', kind: 'lock' | 'garage', id: string | null, payload?: Draft) {
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
      ...(payload ? { body: JSON.stringify({ propertyId, kind, unitId: payload.unitId || null, door: payload.door, code: payload.code, programmingCode: payload.programmingCode, garageId: payload.garageId, garageRent: payload.garageRent }) } : {}),
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
    (['code', 'programming_code'] as const).map((field) => (
      <div key={field} className="mt-2 flex min-w-0 items-center gap-2">
        <span className="w-32 shrink-0 text-xs text-slate-500">{field === 'code' ? 'Access code' : 'Programming code'}</span>
        <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono">{revealed[`${entry.id}-${field}`] ? entry[field] || 'Not set' : entry[field] ? '••••••' : 'Not set'}</span>
        <button type="button" title={revealed[`${entry.id}-${field}`] ? 'Hide code' : 'Show code'} aria-label={revealed[`${entry.id}-${field}`] ? 'Hide code' : 'Show code'} onClick={() => setRevealed((current) => ({ ...current, [`${entry.id}-${field}`]: !current[`${entry.id}-${field}`] }))} className="text-slate-500">{revealed[`${entry.id}-${field}`] ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </div>
    ))
  );

  const lockForm = (unitId: string | null) => editor?.kind === 'lock' && editor.unitId === unitId ? (
    <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 rounded-md border border-teal-200 bg-teal-50/50 p-4 sm:grid-cols-3">
      <label className="text-xs font-semibold text-slate-600">Door<input className={`mt-1 ${inputClass}`} required maxLength={100} list="door-names" value={draft.door} onChange={(event) => setDraft({ ...draft, door: event.target.value })} placeholder="Front door" /></label>
      <label className="text-xs font-semibold text-slate-600">Code<input className={`mt-1 ${inputClass}`} maxLength={100} autoComplete="off" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
      <label className="text-xs font-semibold text-slate-600">Programming Code<input className={`mt-1 ${inputClass}`} maxLength={100} autoComplete="off" value={draft.programmingCode} onChange={(event) => setDraft({ ...draft, programmingCode: event.target.value })} /></label>
      <datalist id="door-names"><option value="Front door" /><option value="Back door" /></datalist>
      <div className="flex gap-2 sm:col-span-3"><button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save lock'}</button><button type="button" onClick={() => setEditor(null)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm">Cancel</button></div>
    </form>
  ) : null;

  const lockSection = (title: string, unitId: string | null) => {
    const locks = data?.locks.filter((lock) => lock.unit_id === unitId) ?? [];
    return (
      <section key={unitId ?? 'property'} className="border-b border-slate-200 py-5 last:border-0">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">{title}</h3><button type="button" onClick={() => startLock(unitId)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"><Plus size={15} />Add Lock</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {['Front door', 'Back door'].map((door) => locks.some((lock) => lock.door.toLowerCase() === door.toLowerCase()) ? null : (
            <div key={door} className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">{door} · No lock added</div>
          ))}
          {locks.map((lock) => (
            <div key={lock.id} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{lock.door}</p><div className="flex gap-2"><button type="button" onClick={() => startLock(unitId, lock)} className="text-xs font-medium text-teal-800 underline">Edit</button><button type="button" disabled={saving} onClick={() => void remove('lock', lock.id)} title="Remove lock" aria-label={`Remove ${lock.door}`} className="text-rose-700"><Trash2 size={16} /></button></div></div>
              {codeFields(lock)}
            </div>
          ))}
        </div>
        {lockForm(unitId)}
      </section>
    );
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Door Codes', href: '/dashboard/door-codes' }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Door Codes</h1><p className="mt-1 text-sm text-slate-600">Locks and garage assignments by property</p></div><button type="button" onClick={() => router.push('/dashboard')} className="text-sm font-medium text-slate-600 underline">Maintenance Tickets</button></div>
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
                  {lockSection('Property entrances', null)}
                  {data.units.map((unit) => lockSection(`Unit ${unit.unit_number}`, unit.id))}
                </section>
                <section className="mt-7 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Garage Codes</h2><p className="text-sm text-slate-500">Each garage can be assigned to one unit; units may have multiple garages.</p></div>{data.canManageGarages && <button type="button" onClick={() => startGarage()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Plus size={16} />Add Garage</button>}</div>
                  <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                    {data.garages.length === 0 && <p className="py-6 text-sm text-slate-500">No garages yet.</p>}
                    {data.garages.map((garage) => <div key={garage.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold">{garage.garage_id}</p><p className="text-slate-600">{data.units.find((unit) => unit.id === garage.unit_id)?.unit_number ? `Unit ${data.units.find((unit) => unit.id === garage.unit_id)?.unit_number}` : 'Unassigned'}{data.canManageGarages && garage.garage_rent !== null ? ` · $${Number(garage.garage_rent).toFixed(2)}/mo` : ''}</p>{codeFields(garage)}</div>{data.canManageGarages && <div className="flex gap-3"><button type="button" onClick={() => startGarage(garage)} className="font-medium text-teal-800 underline">Edit</button><button type="button" disabled={saving} onClick={() => void remove('garage', garage.id)} aria-label={`Remove ${garage.garage_id}`} className="text-rose-700"><Trash2 size={16} /></button></div>}</div>)}
                  </div>
                  {editor?.kind === 'garage' && <form onSubmit={(event) => void save(event)} className="mt-4 grid gap-3 rounded-md border border-teal-200 bg-teal-50/50 p-4 sm:grid-cols-3">
                    <label className="text-xs font-semibold text-slate-600">Garage ID<input required maxLength={100} className={`mt-1 ${inputClass}`} value={draft.garageId} onChange={(event) => setDraft({ ...draft, garageId: event.target.value })} placeholder="Trash Garage" /></label>
                    <label className="text-xs font-semibold text-slate-600">Assigned unit<select className={`mt-1 ${inputClass}`} value={draft.unitId} onChange={(event) => setDraft({ ...draft, unitId: event.target.value })}><option value="">Unassigned</option>{data.units.map((unit) => <option key={unit.id} value={unit.id}>Unit {unit.unit_number}</option>)}</select></label>
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