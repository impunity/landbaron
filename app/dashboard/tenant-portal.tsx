'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from './logout-button';

type PortalData = {
  tenant: { id: string; name: string; email?: string | null; phone?: string | null; avatar_url?: string | null };
  unit: { unit_number: string; unit_photos?: Array<{ photo_url: string; caption?: string | null }> };
  property: { id: string; name: string; address: string; city?: string | null; state?: string | null; postal_code?: string | null };
  unitPhotos: Array<{ photo_url: string; caption?: string | null }>;
  improvements: Array<{ id: string; photo_url: string; caption?: string | null; created_at: string }>;
};

export function TenantPortal({ session }: { session: SessionUser }) {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const loadPortal = async () => {
    const auth = await supabase?.auth.getSession();
    const token = auth?.data.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/tenant-portal', { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Tenant portal could not be loaded.');
    setData(result);
  };

  useEffect(() => {
    void loadPortal().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Tenant portal could not be loaded.')).finally(() => setLoading(false));
  }, []);

  const uploadImprovement = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/tenant-portal/photos', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Photo upload failed.');
      await loadPortal();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Photo upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/tenant-portal/avatar', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Avatar upload failed.');
      await loadPortal();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Avatar upload failed.');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-5xl rounded-2xl bg-white p-10 text-center text-slate-500">Loading your maintenance portal...</div></main>;
  if (!data) return <main className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-5xl rounded-2xl bg-white p-10 text-center text-rose-700">{error || 'No tenant record was found.'}</div></main>;

  const avatar = data.tenant.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.tenant.name)}&background=0f766e&color=fff&size=256`;
  const unitPhoto = data.unitPhotos[0]?.photo_url;
  const address = [data.property.address, data.property.city, data.property.state, data.property.postal_code].filter(Boolean).join(', ');

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">LANDBARON</p>
            <h1 className="mt-2 text-3xl font-semibold">Welcome to the Maintenance Portal for {data.property.name}!</h1>
            <p className="mt-2 text-sm text-slate-600">File maintenance requests, share improvements, and stay connected with your maintenance team.</p>
          </div>
          <div className="flex items-center gap-3"><button type="button" onClick={() => router.push('/dashboard')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Maintenance Tickets</button><button type="button" onClick={() => router.push('/dashboard/tenant-portal/emergency-contacts')} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">Emergency Contacts</button><LogoutButton /></div>
        </header>

        {error && <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {unitPhoto ? <img src={unitPhoto} alt={`Unit ${data.unit.unit_number}`} className="h-72 w-full object-cover" /> : <div className="flex h-72 items-center justify-center bg-slate-200 text-slate-500">No unit photo yet</div>}
            <div className="p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your home</p><h2 className="mt-2 text-2xl font-semibold">Unit {data.unit.unit_number}</h2><p className="mt-1 text-slate-600">{address}</p></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4"><div className="relative"><img src={avatar} alt={`${data.tenant.name} avatar`} className="h-32 w-32 rounded-full object-cover ring-4 ring-slate-100" /><label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white">{avatarUploading ? '...' : 'Replace'}<input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" /></label></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your profile</p><h2 className="mt-1 text-xl font-semibold">{data.tenant.name}</h2></div></div>
            <dl className="mt-6 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd>{data.tenant.email || session.email}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd>{data.tenant.phone || 'Not provided'}</dd></div></dl>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Improvements you have made</h2><p className="mt-1 text-sm text-slate-500">Share photos of voluntary improvements or upgrades in your unit.</p></div><label className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">{uploading ? 'Uploading...' : 'Upload improvement photo'}<input type="file" accept="image/*" onChange={uploadImprovement} disabled={uploading} className="hidden" /></label></div>{data.improvements.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No improvement photos uploaded yet.</p> : <div className="mt-6 grid gap-4 sm:grid-cols-3">{data.improvements.map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-200"><img src={photo.photo_url} alt={photo.caption || 'Tenant improvement'} className="h-40 w-full object-cover" /><p className="p-3 text-xs text-slate-600">{photo.caption}</p></div>)}</div>}</section>
      </div>
    </main>
  );
}
