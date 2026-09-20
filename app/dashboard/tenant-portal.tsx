'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from './logout-button';

type PortalData = {
  tenant: { id: string; unit_id: string; name: string; email?: string | null; phone?: string | null; avatar_url?: string | null };
  unit: { unit_number: string; unit_photos?: Array<{ photo_url: string; caption?: string | null }> };
  property: { id: string; name: string; address: string; city?: string | null; state?: string | null; postal_code?: string | null };
  unitPhotos: Array<{ photo_url: string; caption?: string | null }>;
  improvements: Array<{ id: string; photo_url: string; caption?: string | null; created_at: string }>;
  primaryStaff: Array<{ name: string; email?: string | null; phone_number?: string | null; avatar_url?: string | null }>;
  secondaryStaff: Array<{ name: string; email?: string | null; phone_number?: string | null; avatar_url?: string | null }>;
  owners: Array<{ name: string; email?: string | null; phone_number?: string | null; avatar_url?: string | null }>;
};

type TenantTicket = { id: string; ticket_number?: number | null; title: string; status?: string | null; priority?: string | null; created_at?: string | null };

const normalizeStatus = (status?: string | null) => {
  if (!status) return 'Open';
  const value = status.trim();
  if (value.toLowerCase() === 'archived') return 'Archived';
  return value;
};

const getFallbackTicketNumber = (id: string) => {
  const digits = id.replace(/\D/g, '').slice(-5);
  return digits.padStart(5, '0');
};

const formatTicketNumber = (ticket: Pick<TenantTicket, 'id' | 'ticket_number'>) => (
  `#${String(ticket.ticket_number ?? getFallbackTicketNumber(ticket.id)).padStart(5, '0')}`
);

export function TenantPortal({ session }: { session: SessionUser }) {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDraft, setRequestDraft] = useState({ severity: '', description: '' });
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [tickets, setTickets] = useState<TenantTicket[]>([]);
  const [showArchivedTickets, setShowArchivedTickets] = useState(false);

  const loadPortal = async () => {
    const auth = await supabase?.auth.getSession();
    const token = auth?.data.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/tenant-portal', { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || 'Tenant portal could not be loaded.');
    setData(result);
  };

  const loadTickets = async () => {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (response.ok) setTickets(result.tickets ?? []);
  };

  useEffect(() => {
    void loadPortal().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Tenant portal could not be loaded.')).finally(() => setLoading(false));
    void loadTickets();
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

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || !requestDraft.severity || !requestDraft.description.trim()) return;
    setSubmittingRequest(true);
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: requestDraft.description.trim().slice(0, 50),
          description: `Email: ${session.email}\nAddress: ${data.property.address}, Unit ${data.unit.unit_number}\n\n${requestDraft.description.trim()}`,
          status: 'Open',
          priority: ({ '1': 'Low', '2': 'Low', '3': 'Medium', '4': 'High', '5': 'Emergency' } as Record<string, string>)[requestDraft.severity],
          property_id: data.property.id,
          unit_id: data.tenant.unit_id,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Maintenance request could not be submitted.');
      const ticketId = typeof result.ticket?.id === 'string' ? result.ticket.id : '';
      if (requestFiles.length > 0 && ticketId) {
        for (const file of requestFiles) {
          const fileBody = new FormData();
          fileBody.append('file', file);
          const fileResponse = await fetch(`/api/tickets/${ticketId}/photos`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fileBody,
          });
          if (!fileResponse.ok) {
            const fileResult = await fileResponse.json().catch(() => ({}));
            throw new Error(fileResult?.error || 'Request submitted, but one or more files could not be uploaded.');
          }
        }
      }
      setRequestDraft({ severity: '', description: '' });
      setRequestFiles([]);
      setShowRequestForm(false);
      router.push(`/dashboard/tickets/${ticketId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Maintenance request could not be submitted.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const deleteTicket = async (ticketId: string) => {
    if (!window.confirm('Delete this maintenance request? This action cannot be undone.')) return;
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Maintenance request could not be deleted.');
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Maintenance request could not be deleted.');
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-5xl rounded-2xl bg-white p-10 text-center text-slate-500">Loading your maintenance portal...</div></main>;
  if (!data) return <main className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-5xl rounded-2xl bg-white p-10 text-center text-rose-700">{error || 'No tenant record was found.'}</div></main>;

  const avatar = data.tenant.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.tenant.name)}&background=0f766e&color=fff&size=256`;
  const unitPhoto = data.unitPhotos[0]?.photo_url;
  const address = [data.property.address, data.property.city, data.property.state, data.property.postal_code].filter(Boolean).join(', ');
  const openTickets = tickets.filter((ticket) => normalizeStatus(ticket.status) !== 'Archived');
  const archivedTickets = tickets.filter((ticket) => normalizeStatus(ticket.status) === 'Archived');
  const maintenanceContacts = [
    ...data.primaryStaff.map((person) => ({ ...person, label: 'Primary Maintenance Contact' })),
    ...data.secondaryStaff.map((person) => ({ ...person, label: 'Secondary Maintenance Contact' })),
    ...data.owners.map((person) => ({ ...person, label: 'Owner' })),
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">LANDBARON</p>
            <h1 className="mt-2 text-3xl font-semibold">Welcome to the {data.property.name} Maintenance Portal</h1>
            <p className="mt-2 text-sm text-slate-600">File maintenance requests, share improvements, and stay connected with your maintenance team.</p>
          </div>
          <div className="flex items-center gap-3"><button type="button" onClick={() => setShowRequestForm(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">Submit Maintenance Request</button><button type="button" onClick={() => router.push('/dashboard/vendors')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Approved Vendors</button><button type="button" onClick={() => router.push('/dashboard/tenant-portal/emergency-contacts')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Emergency Contacts</button><LogoutButton /></div>
        </header>

        {error && <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {unitPhoto ? <img src={unitPhoto} alt={`Unit ${data.unit.unit_number}`} className="h-72 w-full object-cover" /> : <div className="flex h-72 items-center justify-center bg-slate-200 text-slate-500">No unit photo yet</div>}
            <div className="p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your place</p><h2 className="mt-2 text-2xl font-semibold">Unit {data.unit.unit_number}</h2><p className="mt-1 text-slate-600">{address}</p></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4"><div className="relative"><img src={avatar} alt={`${data.tenant.name} avatar`} className="h-32 w-32 rounded-full object-cover ring-4 ring-slate-100" /><label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white">{avatarUploading ? '...' : 'Replace'}<input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" /></label></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your info</p><h2 className="mt-1 text-xl font-semibold">{data.tenant.name}</h2></div></div>
            <dl className="mt-6 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd>{data.tenant.email || session.email}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd>{data.tenant.phone || 'Not provided'}</dd></div></dl>
            {maintenanceContacts.length > 0 && <div className="mt-6 border-t border-slate-100 pt-5"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Maintenance Contacts</h2><div className="mt-4 space-y-4">{maintenanceContacts.map((person, index) => <div key={`${person.email}-${index}`} className="flex items-center gap-3"><img src={person.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=0f766e&color=fff`} alt="" className="h-12 w-12 rounded-full object-cover"/><div><p className="text-xs uppercase tracking-wider text-slate-500">{person.label}</p><p className="font-semibold">{person.name}</p>{person.phone_number && <p className="text-sm text-slate-600">{person.phone_number}</p>}{person.email && <a href={`mailto:${person.email}`} className="text-sm text-slate-600 underline">{person.email}</a>}</div></div>)}</div></div>}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Open Maintenance Requests</h2>
            <button type="button" onClick={() => setShowArchivedTickets((prev) => !prev)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">
              {showArchivedTickets ? 'Hide Archived Tickets' : 'Show Archived Tickets'}
            </button>
          </div>
          {openTickets.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No open maintenance requests.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {openTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-semibold">{ticket.title}</p>
                    <p className="text-xs uppercase tracking-wider text-slate-500">{formatTicketNumber(ticket)} · {normalizeStatus(ticket.status)} · {ticket.priority || 'Medium'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">
                      Open ticket
                    </button>
                    <button type="button" onClick={() => void deleteTicket(ticket.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showArchivedTickets && (
            <div className="mt-6 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Archived Tickets</h3>
              {archivedTickets.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No archived tickets.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {archivedTickets.map((ticket) => (
                    <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <p className="font-semibold">{ticket.title}</p>
                        <p className="text-xs uppercase tracking-wider text-slate-500">{formatTicketNumber(ticket)} · Archived · {ticket.priority || 'Medium'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">
                          Open ticket
                        </button>
                        <button type="button" onClick={() => void deleteTicket(ticket.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Improvements you have made</h2><p className="mt-1 text-sm text-slate-500">Share photos of voluntary improvements or upgrades in your unit.</p></div><label className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">{uploading ? 'Uploading...' : 'Upload improvement photo'}<input type="file" accept="image/*" onChange={uploadImprovement} disabled={uploading} className="hidden" /></label></div>{data.improvements.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No improvement photos uploaded yet.</p> : <div className="mt-6 grid gap-4 sm:grid-cols-2">{data.improvements.map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-200"><img src={photo.photo_url} alt={photo.caption || 'Tenant improvement'} className="h-40 w-full object-cover" /><p className="p-3 text-xs text-slate-600">{photo.caption}</p></div>)}</div>}</div>
        </section>

        {showRequestForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitRequest} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-semibold">Submit Maintenance Request</h2><label className="mt-5 block text-sm font-medium">Severity<select required value={requestDraft.severity} onChange={(event) => setRequestDraft({ ...requestDraft, severity: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"><option value="">Select severity</option><option value="1">1 - Nice to have</option><option value="2">2 - Minor issue</option><option value="3">3 - Important</option><option value="4">4 - Major issue</option><option value="5">5 - Emergency</option></select></label><label className="mt-4 block text-sm font-medium">What needs attention?<textarea required rows={5} value={requestDraft.description} onChange={(event) => setRequestDraft({ ...requestDraft, description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label><div className="mt-4"><div className="flex items-center justify-between"><label className="block text-sm font-medium">Photos/Videos</label><span className="text-xs text-slate-500">Max 25MB per file</span></div><input type="file" accept="image/*,video/*" multiple onChange={(event) => setRequestFiles(Array.from(event.target.files ?? []))} className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700" />{requestFiles.length > 0 && <p className="mt-2 text-xs text-slate-500">{requestFiles.length} file{requestFiles.length === 1 ? '' : 's'} selected</p>}</div><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => { setShowRequestForm(false); setRequestFiles([]); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={submittingRequest} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">{submittingRequest ? 'Submitting...' : 'Submit request'}</button></div></form></div>}
      </div>
    </main>
  );
}
