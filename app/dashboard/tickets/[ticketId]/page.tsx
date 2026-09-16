'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { fetchUserRole, getRoleLabel, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from '../../logout-button';

type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  property_id: string | null;
  unit_id: string | null;
  owner_notes?: string | null;
  labor_cost?: number | null;
  materials_cost?: number | null;
};

type TicketReceipt = {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  created_at: string;
};

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Maintenance' | 'Contractor';
};

const normalizeStatus = (status?: string | null) => {
  if (!status) return 'Open';

  const value = status.trim();
  if (value.toLowerCase() === 'open') return 'Open';
  if (value.toLowerCase() === 'in progress') return 'In Progress';
  if (value.toLowerCase() === 'waiting on parts') return 'Waiting on Parts';
  if (value.toLowerCase() === 'resolved') return 'Resolved';
  if (value.toLowerCase() === 'closed' || value.toLowerCase() === 'dismissed') return 'Closed';
  if (value.toLowerCase() === 'archived') return 'Archived';

  return value;
};

const normalizePriority = (priority?: string | null) => {
  if (!priority) return 'Medium';

  const value = priority.trim();
  if (value.toLowerCase() === 'low') return 'Low';
  if (value.toLowerCase() === 'medium') return 'Medium';
  if (value.toLowerCase() === 'high') return 'High';
  if (value.toLowerCase() === 'emergency') return 'Emergency';

  return value;
};

const sanitizeTicketDescription = (description?: string | null) => {
  if (!description) {
    return '';
  }

  return description
    .replace(/(^|\n)\s*Photo:\s*.*$/gim, '$1')
    .replace(/(^|\n)\s*Assigned to:\s*.*$/gm, '$1')
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const parsePhotoEntries = (description?: string | null) => {
  if (!description) return [] as Array<{ name: string; url: string }>;

  const entries: Array<{ name: string; url: string }> = [];

  for (const line of description.split(/\n+/)) {
    const entryMatch = line.match(/^Photo:\s*(.*?)\s*\|\s*(https?:\/\/[^\s)]+)\s*$/i);
    if (entryMatch) {
      const name = entryMatch[1].trim() || 'photo';
      const url = entryMatch[2].trim();
      entries.push({ name, url });
      continue;
    }

    const legacyMatch = line.match(/^Photo:\s*(https?:\/\/[^\s)]+)\s*$/i);
    if (legacyMatch) {
      entries.push({ name: 'photo', url: legacyMatch[1].trim() });
    }
  }

  const urlMatches = description.match(/https?:\/\/[^\s)]+/gi) ?? [];
  for (const url of urlMatches) {
    const trimmedUrl = url.replace(/[.,;!?]+$/, '');
    if (!entries.some((entry) => entry.url === trimmedUrl)) {
      entries.push({ name: 'photo', url: trimmedUrl });
    }
  }

  return entries;
};

const getPhotoFileName = (photoUrl: string, fallbackName?: string) => {
  if (fallbackName && fallbackName.trim()) {
    return fallbackName.trim();
  }

  try {
    const url = new URL(photoUrl);
    const pathName = url.pathname.split('/').filter(Boolean).at(-1) ?? photoUrl;
    const decodedName = decodeURIComponent(pathName);
    return decodedName.replace(/^[0-9]+-[a-f0-9]+-?/i, '').replace(/^\d+-/, '');
  } catch {
    const fallbackNameFromUrl = photoUrl.split('/').filter(Boolean).at(-1) ?? photoUrl;
    return fallbackNameFromUrl.replace(/^[0-9]+-[a-f0-9]+-?/i, '').replace(/^\d+-/, '');
  }
};

const labelMap: Record<string, string> = {
  Open: 'Open',
  'In Progress': 'In Progress',
  'Waiting on Parts': 'Waiting on Parts',
  Resolved: 'Resolved',
  Closed: 'Dismissed',
  Archived: 'Archived',
};

const formatAssignmentLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'Unassigned';
  }

  const emailMatch = trimmed.match(/^(.+?)\s*<[^>]+>\s*$/);
  if (emailMatch) {
    return emailMatch[1].trim();
  }

  return trimmed;
};

const parseAssignment = (description?: string | null) => {
  if (!description) {
    return { label: 'Unassigned', value: '' };
  }

  const assignmentMatch = description.match(/(?:^|\n)Assigned to:\s*([^\n]+)/i);
  if (!assignmentMatch) {
    return { label: 'Unassigned', value: '' };
  }

  const value = assignmentMatch[1].trim();
  return { label: formatAssignmentLabel(value) || 'Unassigned', value };
};

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ ticketId: string }>();
  const ticketId = params?.ticketId;

  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<string>('Open');
  const [assignedStaff, setAssignedStaff] = useState('');
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<TicketReceipt[]>([]);
  const [laborCost, setLaborCost] = useState('');
  const [materialsCost, setMaterialsCost] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

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

      setSessionState({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'Google User',
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

      setSessionState({
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'Google User',
        email: nextUser.email || '',
        role,
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const loadTicketDetail = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch(`/api/tickets/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Could not load ticket details.');
      }

      const nextTicket = result.ticket ?? null;
      const description = nextTicket?.description ?? '';
      const noteMatch = description.match(/Owner notes:\n([\s\S]*)$/i);
      const assignmentValue =
        typeof nextTicket?.assigned_to === 'string' && nextTicket.assigned_to.trim()
          ? nextTicket.assigned_to.trim()
          : parseAssignment(description).value;

      if (session?.role === 'tenant') {
        const allowed = description.toLowerCase().includes(`email: ${session.email.toLowerCase()}`);
        if (!allowed) {
          throw new Error('You can only view your own tickets.');
        }
      }

      setTicket(nextTicket);
      setStatusDraft(normalizeStatus(nextTicket?.status ?? 'Open'));
      setNoteDraft(noteMatch ? noteMatch[1].trim() : '');
      setAssignedStaff(assignmentValue);
      setLaborCost(nextTicket?.labor_cost !== null && nextTicket?.labor_cost !== undefined ? String(nextTicket.labor_cost) : '');
      setMaterialsCost(nextTicket?.materials_cost !== null && nextTicket?.materials_cost !== undefined ? String(nextTicket.materials_cost) : '');
      setReceipts(Array.isArray(result.receipts) ? result.receipts : []);
    } catch (detailError) {
      console.error(detailError);
      setError('Unable to load ticket details right now.');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session || session.role !== 'owner') {
      setStaffMembers([]);
      return;
    }

    const loadStaffMembers = async () => {
      try {
        const response = await fetch('/api/staff', {
          headers: {
            'x-user-role': session.role,
          },
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.error || 'Unable to load staff members.');
        }

        setStaffMembers(Array.isArray(result.staff) ? result.staff : []);
      } catch (error) {
        console.error(error);
        setStaffMembers([]);
      }
    };

    void loadStaffMembers();
  }, [session]);

  useEffect(() => {
    if (!ticketId) {
      setLoading(false);
      return;
    }

    loadTicketDetail(ticketId);
  }, [ticketId, session]);

  const selectedPhotos = useMemo(() => parsePhotoEntries(ticket?.description ?? ''), [ticket]);

  const handleTicketUpdate = async (updates: { notes?: string; status?: string; assigned_to?: string; labor_cost?: number | null; materials_cost?: number | null }) => {
    if (!ticketId) {
      return;
    }

    setDetailSaving(true);
    setError(null);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(updates),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Ticket update failed.');
      }

      await loadTicketDetail(ticketId);
    } catch (updateError) {
      console.error(updateError);
      setError(
        updateError instanceof Error && updateError.message
          ? updateError.message
          : 'Ticket update failed. Please try again.',
      );
    } finally {
      setDetailSaving(false);
    }
  };

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !ticketId) return;

    setUploadingReceipt(true);
    setReceiptError(null);
    try {
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error('Sign in is required.');

      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/tickets/${ticketId}/receipts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Receipt upload failed.');
      await loadTicketDetail(ticketId);
    } catch (uploadError) {
      setReceiptError(uploadError instanceof Error ? uploadError.message : 'Receipt upload failed.');
    } finally {
      setUploadingReceipt(false);
      event.target.value = '';
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    if (!ticketId || !window.confirm('Delete this receipt?')) return;
    try {
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch(`/api/tickets/${ticketId}/receipts?receiptId=${receiptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });
      if (!response.ok) throw new Error('Receipt deletion failed.');
      setReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    } catch (deleteError) {
      setReceiptError(deleteError instanceof Error ? deleteError.message : 'Receipt deletion failed.');
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !ticketId) {
      return;
    }

    setUploadingPhoto(true);
    setPhotoUploadError(null);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/tickets/${ticketId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Photo upload failed.');
      }

      await loadTicketDetail(ticketId);
    } catch (uploadError) {
      console.error(uploadError);
      setPhotoUploadError(
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : 'Photo upload failed. Please try again.',
      );
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const handleDeleteTicket = async () => {
    if (!ticketId || !session || session.role !== 'owner') {
      return;
    }

    const confirmed = window.confirm('Delete this ticket permanently? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDetailSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': session.email,
          'x-user-role': session.role,
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Ticket could not be deleted.');
      }

      router.push('/dashboard');
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        deleteError instanceof Error && deleteError.message
          ? deleteError.message
          : 'Ticket could not be deleted.',
      );
    } finally {
      setDetailSaving(false);
    }
  };

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-12">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">Loading ticket...</p>
        </div>
      </main>
    );
  }

  if (error && !ticket) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-12">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">LANDBARON</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Ticket unavailable</h1>
          <p className="mt-3 text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Back to tickets
          </button>
        </div>
      </main>
    );
  }

  if (!ticket) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Back to Tickets
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Maintenance Tickets
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white">
              {getRoleLabel(session.role)}
            </div>
            <LogoutButton />
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ticket details</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">{ticket.title}</h1>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {sanitizeTicketDescription(ticket.description) || 'No issue description provided.'}
                </p>
              </div>

              {selectedPhotos.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Photos</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {selectedPhotos.map((photoEntry) => {
                      const photoName = getPhotoFileName(photoEntry.url, photoEntry.name);

                      return (
                        <a
                          key={photoEntry.url}
                          href={photoEntry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                        >
                          <img src={photoEntry.url} alt={photoName} className="h-48 w-full object-cover" />
                          <div className="border-t border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                            {photoName}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Upload photo</label>
                  <span className="text-xs text-slate-500">
                    JPG, PNG, WEBP, GIF • Max 8 MB
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {uploadingPhoto && <p className="mt-2 text-xs text-slate-500">Uploading photo...</p>}
                {photoUploadError && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {photoUploadError}
                  </div>
                )}
              </div>

              {session.role !== 'tenant' && (
                <div className="rounded-xl border border-slate-200 p-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">Owner notes</label>
                <textarea
                  rows={5}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Add internal notes for the owner or maintenance team..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                />
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => handleTicketUpdate({ notes: '' })}
                    disabled={detailSaving || !noteDraft.trim()}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Clearing...' : 'Clear notes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTicketUpdate({ notes: noteDraft })}
                    disabled={detailSaving}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Saving...' : 'Save notes'}
                  </button>
                </div>
                </div>
              )}

              {session.role !== 'tenant' && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Receipts</p>
                      <p className="text-xs text-slate-500">PDF, JPG, PNG, WEBP · Max 10 MB</p>
                    </div>
                    <label className="cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700">
                      {uploadingReceipt ? 'Uploading...' : 'Upload receipt'}
                      <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={handleReceiptUpload} disabled={uploadingReceipt} className="hidden" />
                    </label>
                  </div>
                  {receiptError && <p className="mt-3 text-sm text-rose-700">{receiptError}</p>}
                  {receipts.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No receipts uploaded.</p>
                  ) : (
                    <div className="mt-4 divide-y divide-slate-100">
                      {receipts.map((receipt) => (
                        <div key={receipt.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <a href={receipt.file_url} target="_blank" rel="noreferrer" className="truncate font-medium text-slate-800 underline underline-offset-2">{receipt.file_name}</a>
                          <button type="button" onClick={() => void handleDeleteReceipt(receipt.id)} className="text-xs font-medium text-rose-700">Delete</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside className="space-y-4">
              {session.role !== 'tenant' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Update status
                  </label>
                  <select
                    value={statusDraft}
                    onChange={(event) => setStatusDraft(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  >
                    {Object.keys(labelMap).map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {labelMap[statusOption]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Assign to
                  </label>
                  <select
                    value={assignedStaff}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setAssignedStaff(nextValue);
                      void handleTicketUpdate({ assigned_to: nextValue, status: statusDraft, notes: noteDraft });
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  >
                    <option value="">Unassigned</option>
                    {staffMembers.map((member) => (
                      <option key={member.id} value={`${member.name} <${member.email}>`}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                  </select>
                </div>

                <p className="mt-3 text-xs text-slate-500">Updated {new Date(ticket.updated_at).toLocaleDateString()}</p>
                {ticket.resolved_at && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Resolved {new Date(ticket.resolved_at).toLocaleDateString()}
                  </p>
                )}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ticket info</p>
                <dl className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Priority</dt>
                    <dd>{normalizePriority(ticket.priority)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Category</dt>
                    <dd>{ticket.category ?? 'General'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Property</dt>
                    <dd>{ticket.property_id ?? 'Unassigned'}</dd>
                  </div>
                </dl>
              </div>

              {session.role !== 'tenant' && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ticket cost</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-slate-600">Labor
                      <input type="number" min="0" step="0.01" value={laborCost} onChange={(event) => setLaborCost(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">Materials
                      <input type="number" min="0" step="0.01" value={materialsCost} onChange={(event) => setMaterialsCost(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
                    <span className="font-medium text-slate-600">Total</span>
                    <span className="font-semibold text-slate-900">${(Number(laborCost || 0) + Number(materialsCost || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <button type="button" onClick={() => void handleTicketUpdate({ labor_cost: laborCost ? Number(laborCost) : null, materials_cost: materialsCost ? Number(materialsCost) : null })} disabled={detailSaving} className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Save costs</button>
                </div>
              )}

              {session.role !== 'tenant' && (
                <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleTicketUpdate({ status: statusDraft, notes: noteDraft, assigned_to: assignedStaff })}
                    disabled={detailSaving}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Updating...' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusDraft('Resolved');
                      handleTicketUpdate({ status: 'Resolved', notes: noteDraft });
                    }}
                    disabled={detailSaving}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Updating...' : 'Resolve ticket'}
                  </button>
                </div>

                {(session.role === 'maintenance' || session.role === 'contractor') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusDraft('Closed');
                      handleTicketUpdate({ status: 'Closed', notes: noteDraft || 'Dismissed by maintenance.' });
                    }}
                    disabled={detailSaving}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Updating...' : 'Dismiss ticket'}
                  </button>
                )}

                {session.role === 'owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusDraft('Archived');
                      void handleTicketUpdate({ status: 'Archived', notes: noteDraft, assigned_to: assignedStaff });
                    }}
                    disabled={detailSaving || statusDraft === 'Archived'}
                    className="rounded-xl border border-stone-300 bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Updating...' : 'Archive ticket'}
                  </button>
                )}

                {session.role === 'owner' && (
                  <button
                    type="button"
                    onClick={handleDeleteTicket}
                    disabled={detailSaving}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {detailSaving ? 'Deleting...' : 'Delete ticket'}
                  </button>
                )}
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
