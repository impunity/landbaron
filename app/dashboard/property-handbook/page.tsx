'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ImagePlus, Save } from 'lucide-react';

import { fetchUserRole, type UserRole } from '@/lib/auth';
import { googleDocPreview } from '@/lib/property-handbook';
import { supabase } from '@/lib/supabase';
import { formatTimestamp, useTimeFormat } from '@/lib/time-format';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';
import { PropertyMap } from '../property-map';

type Property = { id: string; name: string; address: string; city: string | null; state: string | null; postal_code: string | null; latitude: number | null; longitude: number | null };
type Handbook = { body: string; google_doc_url: string | null; photo_url: string | null; updated_at: string | null };
type HandbookData = { properties: Property[]; property: Property | null; canEdit: boolean; unitCount: number; handbook: Handbook };
const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600';

export default function PropertyHandbookPage() {
  const router = useRouter();
  const timeFormat = useTimeFormat();
  const [role, setRole] = useState<UserRole | null>(null);
  const [data, setData] = useState<HandbookData | null>(null);
  const [body, setBody] = useState('');
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (propertyId?: string) => {
    const session = (await supabase?.auth.getSession())?.data.session;
    if (!session) { router.replace('/login'); return; }
    const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
    const response = await fetch(`/api/property-handbook${query}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Property handbook could not be loaded.');
    setData(result);
    setBody(result.handbook?.body ?? '');
    setGoogleDocUrl(result.handbook?.google_doc_url ?? '');
  }, [router]);

  useEffect(() => {
    void (async () => {
      try {
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session) { router.replace('/login'); return; }
        setRole(await fetchUserRole(session.user.email, supabase));
        await load(new URLSearchParams(window.location.search).get('propertyId') ?? undefined);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Property handbook could not be loaded.');
      } finally { setLoading(false); }
    })();
  }, [router, load]);

  const dirty = Boolean(data?.property && (body !== data.handbook.body || googleDocUrl !== (data.handbook.google_doc_url ?? '')));
  const previewUrl = googleDocPreview(data?.handbook?.google_doc_url ?? '');

  async function selectProperty(propertyId: string) {
    if (dirty && !window.confirm('Discard unsaved handbook changes?')) return;
    setLoading(true);
    setError('');
    setNotice('');
    try { await load(propertyId); router.replace(`/dashboard/property-handbook?propertyId=${encodeURIComponent(propertyId)}`); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Property handbook could not be loaded.'); }
    finally { setLoading(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data?.property || !data.canEdit) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch('/api/property-handbook', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: data.property.id, body, googleDocUrl }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Property handbook could not be saved.');
      setData({ ...data, handbook: result.handbook });
      setGoogleDocUrl(result.handbook.google_doc_url ?? '');
      setNotice('Handbook saved.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Property handbook could not be saved.'); }
    finally { setSaving(false); }
  }

  async function uploadPropertyPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !data?.property || (role !== 'owner' && role !== 'manager')) return;
    setUploadingPhoto(true);
    setError('');
    setNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const formData = new FormData();
      formData.append('propertyId', data.property.id);
      formData.append('file', file);
      const response = await fetch('/api/property-handbook', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Property photo could not be uploaded.');
      setData({ ...data, handbook: result.handbook });
      setNotice('Property photo uploaded.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Property photo could not be uploaded.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  }

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Property Handbook', href: '/dashboard/property-handbook' }]} />
      <h1 className="mt-3 text-2xl font-semibold">Property Handbook</h1>
      {role && <div className="mt-4 flex flex-wrap gap-2"><DashboardNavButtons current="property-handbook" role={role} propertyId={data?.property?.id} /></div>}
      {error && <p role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-5 text-sm text-emerald-700">{notice}</p>}
      {loading ? <p className="mt-6 text-sm text-slate-500">Loading handbook...</p> : data && !data.property ? <p className="mt-6 text-sm text-slate-500">No accessible properties found.</p> : data?.property && <>
        {data.properties.length > 1 && <label className="mt-6 block max-w-md text-sm font-medium">Property<select className={`mt-1 ${inputClass}`} value={data.property.id} disabled={saving} onChange={(event) => void selectProperty(event.target.value)}>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
        <section className="mt-6 space-y-6 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
          <div><h2 className="text-xl font-semibold">{data.property.name}</h2><p className="mt-2 text-sm text-slate-600">{[data.property.address, data.property.city, data.property.state, data.property.postal_code].filter(Boolean).join(', ')}</p><p className="mt-3 text-sm"><span className="font-semibold">Units</span> {data.unitCount}</p>{data.handbook.updated_at && <p className="mt-3 text-xs text-slate-500">Updated {formatTimestamp(data.handbook.updated_at, timeFormat)}</p>}{previewUrl && <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-teal-800 underline" href={previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />View Google Doc</a>}</div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mt-5 h-56 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {data.handbook.photo_url
                  ? <a href={data.handbook.photo_url} target="_blank" rel="noopener noreferrer" aria-label={`Open full-size photo of ${data.property.name}`} className="block h-full w-full">
                    <img src={data.handbook.photo_url} alt={`${data.property.name} property`} className="h-full w-full object-cover" />
                  </a>
                  : <div className="grid h-full place-items-center text-sm text-slate-500">No property photo uploaded</div>}
              </div>
              {role && (role === 'owner' || role === 'manager') && <label className="mt-3 inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                <ImagePlus size={16} />{uploadingPhoto ? 'Uploading photo...' : data.handbook.photo_url ? 'Replace property photo' : 'Upload property photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif" disabled={uploadingPhoto || saving} onChange={(event) => void uploadPropertyPhoto(event)} className="sr-only" />
              </label>}
            </div>
            <PropertyMap address={data.property.address} city={data.property.city} state={data.property.state} postalCode={data.property.postal_code} latitude={data.property.latitude} longitude={data.property.longitude} />
          </div>
        </section>
        <form onSubmit={(event) => void save(event)} className="border-t border-slate-200 bg-white px-5 py-5 sm:px-6">
          <label htmlFor="handbook-body" className="block text-base font-semibold">General property information</label>
          <textarea id="handbook-body" className={`mt-3 min-h-96 resize-y leading-relaxed ${inputClass}`} rows={16} maxLength={100000} value={body} readOnly={!data.canEdit} disabled={saving} onChange={(event) => setBody(event.target.value)} />
          {data.canEdit && <><label htmlFor="handbook-doc" className="mt-5 block text-sm font-medium">Google Doc link (optional)</label><input id="handbook-doc" type="url" maxLength={2048} className={`mt-1 ${inputClass}`} value={googleDocUrl} disabled={saving} onChange={(event) => setGoogleDocUrl(event.target.value)} /><p className="mt-2 text-xs text-slate-500">Set the document&apos;s Google Drive sharing permissions to Viewer for residents. The handbook opens the read-only preview.</p><button type="submit" disabled={saving || !dirty} className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={16} />{saving ? 'Saving...' : 'Save handbook'}</button></>}
        </form>
      </>}
    </div>
  </main>;
}