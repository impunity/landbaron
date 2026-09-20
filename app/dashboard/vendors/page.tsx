'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from '../logout-button';

type Vendor = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null; service_type?: string | null; website?: string | null; address?: string | null; website_title?: string | null; website_description?: string | null; website_thumbnail_url?: string | null; notes?: string | null };

const emptyDraft = { name: '', company: '', email: '', phone: '', service_type: '', website: '', address: '', notes: '' };

const getVendorAvatarName = (vendor: Pick<Vendor, 'name' | 'company'>) => vendor.company?.trim() || vendor.name;

const getVendorLogoUrl = (vendor: Vendor) => {
  const website = vendor.website?.trim();
  if (!website) return `https://ui-avatars.com/api/?name=${encodeURIComponent(getVendorAvatarName(vendor))}&background=0f766e&color=fff`;
  const domain = website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  return `https://logo.clearbit.com/${domain}`;
};

const cleanVendorText = (value?: string | null, maxLength = 220) => {
  const cleaned = (value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s(?:[#.][A-Za-z_-][\w-]*(?:\[[^\]]+\])?)[\s\S]*$/g, ' ')
    .replace(/\.[\w-]+\[[^\]]+\]\s*\{[^}]+\}/g, ' ')
    .replace(/#[\w-]+\s+#[\w-]+\s+\.[\w-]+\s*\{[^}]+\}/g, ' ')
    .replace(/[{}][^.!?]*$/g, ' ')
    .replace(/\s+\d{2,4}$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
};

export default function VendorsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const auth = await supabase?.auth.getSession();
      const user = auth?.data.session?.user;
      if (!user) return router.replace('/login');
      const role = await fetchUserRole(user.email, supabase);
      setSession({ id: user.id, name: user.user_metadata?.full_name || user.email || 'User', email: user.email || '', role });
      const response = await fetch('/api/vendors', { headers: { Authorization: `Bearer ${auth.data.session?.access_token}` } });
      const result = await response.json();
      if (!response.ok) setError(result.error);
      else setVendors(result.vendors ?? []);
    })();
  }, [router]);

  const addVendor = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const response = await fetch('/api/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(draft) });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setVendors((current) => [...current, result.vendor]);
    setDraft(emptyDraft);
  };

  const removeVendor = async (id: string) => {
    if (!window.confirm('Remove this approved vendor?')) return;
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    await fetch(`/api/vendors?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setVendors((current) => current.filter((vendor) => vendor.id !== id));
  };

  const startEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setEditDraft({
      name: vendor.name ?? '',
      company: vendor.company ?? '',
      email: vendor.email ?? '',
      phone: vendor.phone ?? '',
      service_type: vendor.service_type ?? '',
      website: vendor.website ?? '',
      address: vendor.address ?? '',
      notes: vendor.notes ?? '',
    });
  };

  const saveEditVendor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingVendor) return;
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const response = await fetch(`/api/vendors?id=${editingVendor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(editDraft) });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setVendors((current) => current.map((vendor) => (vendor.id === editingVendor.id ? result.vendor : vendor)));
    setEditingVendor(null);
  };

  if (!session) return null;

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => router.push('/dashboard')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              ← Back to Maintenance Tickets
            </button>
            <h1 className="mt-3 text-3xl font-semibold">Approved Vendors</h1>
          </div>
          <LogoutButton />
        </header>

        {error && <div className="mb-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {session.role !== 'tenant' && (
          <form onSubmit={addVendor} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
            <input required placeholder="Vendor / contact name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Service type" value={draft.service_type} onChange={(e) => setDraft({ ...draft, service_type: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input type="email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input required placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Website" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Address" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add vendor</button>
          </form>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {vendors.map((vendor) => (
            <div key={vendor.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex justify-between gap-3">
                <div className="flex items-start gap-3">
                  <img
                    src={getVendorLogoUrl(vendor)}
                    alt={`${vendor.name} logo`}
                    className="h-12 w-12 rounded-full border border-slate-200 object-contain bg-white"
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getVendorAvatarName(vendor))}&background=0f766e&color=fff`;
                    }}
                  />
                  <div>
                    <h2 className="font-semibold">{vendor.name}</h2>
                    {vendor.company && <p className="text-sm text-slate-500">{vendor.company}</p>}
                    {vendor.service_type && <p className="text-xs uppercase tracking-wider text-slate-500">{vendor.service_type}</p>}
                  </div>
                </div>
                {session.role !== 'tenant' && (
                  <div className="flex shrink-0 items-start gap-2">
                    <button type="button" onClick={() => startEditVendor(vendor)} className="text-sm font-medium text-slate-600 underline">
                      Edit vendor
                    </button>
                    <button type="button" onClick={() => removeVendor(vendor.id)} className="text-sm font-medium text-rose-600 underline">
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <img src={vendor.website_thumbnail_url || getVendorLogoUrl(vendor)} alt={`${vendor.name} website preview`} className="mb-3 h-28 w-full rounded-xl border border-slate-200 bg-white object-contain" onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getVendorAvatarName(vendor))}&background=0f766e&color=fff`; }} />
                {cleanVendorText(vendor.website_title, 90) && <p className="font-medium text-slate-800">{cleanVendorText(vendor.website_title, 90)}</p>}
                {cleanVendorText(vendor.website_description, 220) && <p className="text-slate-600">{cleanVendorText(vendor.website_description, 220)}</p>}
                {vendor.address && <p className="text-slate-700">{vendor.address}</p>}
                {vendor.phone && <a href={`tel:${vendor.phone}`} className="block text-slate-700 underline">{vendor.phone}</a>}
                {vendor.email && <a href={`mailto:${vendor.email}`} className="block text-slate-700 underline">{vendor.email}</a>}
                {vendor.website && <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noreferrer" className="block text-slate-700 underline">{vendor.website}</a>}
                {vendor.notes && <p className="mt-2 text-slate-600">{vendor.notes}</p>}
              </div>
            </div>
          ))}
        </div>

        {editingVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <form onSubmit={saveEditVendor} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold">Edit vendor</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input required placeholder="Vendor / contact name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Company" value={editDraft.company} onChange={(e) => setEditDraft({ ...editDraft, company: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Service type" value={editDraft.service_type} onChange={(e) => setEditDraft({ ...editDraft, service_type: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input type="email" placeholder="Email" value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input required placeholder="Phone" value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Website" value={editDraft.website} onChange={(e) => setEditDraft({ ...editDraft, website: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Address" value={editDraft.address} onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
              </div>
              <textarea rows={3} placeholder="Notes" value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingVendor(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">Save changes</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
