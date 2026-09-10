'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getRoleLabel, getUserRoleByEmail, getVisibleTickets, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type TicketStatus = 'Open' | 'In Progress' | 'Waiting on Parts' | 'Resolved' | 'Closed';

type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus | string | null;
  priority: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  property_id: string | null;
  unit_id: string | null;
  owner_notes?: string | null;
};

type TicketFormState = {
  severity: string;
  email: string;
  address: string;
  description: string;
};

const statusStyles: Record<string, string> = {
  Open: 'bg-rose-100 text-rose-700 ring-rose-200',
  'In Progress': 'bg-amber-100 text-amber-700 ring-amber-200',
  'Waiting on Parts': 'bg-sky-100 text-sky-700 ring-sky-200',
  Resolved: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Closed: 'bg-slate-200 text-slate-700 ring-slate-300',
};

const labelMap: Record<string, string> = {
  Open: 'Open',
  'In Progress': 'In Progress',
  'Waiting on Parts': 'Waiting on Parts',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

const filterTabs = [
  { key: 'all', label: 'All' },
  { key: 'Open', label: 'Open' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Resolved', label: 'Resolved' },
] as const;

type FilterKey = (typeof filterTabs)[number]['key'];

const normalizeStatus = (status?: string | null) => {
  if (!status) return 'Open';

  const value = status.trim();
  if (value.toLowerCase() === 'open') return 'Open';
  if (value.toLowerCase() === 'in progress') return 'In Progress';
  if (value.toLowerCase() === 'waiting on parts') return 'Waiting on Parts';
  if (value.toLowerCase() === 'resolved') return 'Resolved';
  if (value.toLowerCase() === 'closed') return 'Closed';

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

const initialFormState: TicketFormState = {
  severity: '',
  email: '',
  address: '',
  description: '',
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<TicketFormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<string>('Open');

  useEffect(() => {
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;

      if (!sessionUser) {
        router.replace('/login');
        return;
      }

      setSessionState({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'Google User',
        email: sessionUser.email || '',
        role: getUserRoleByEmail(sessionUser.email),
      });
    };

    syncSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user;

      if (!nextUser) {
        setSessionState(null);
        router.replace('/login');
        return;
      }

      setSessionState({
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'Google User',
        email: nextUser.email || '',
        role: getUserRoleByEmail(nextUser.email),
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  async function loadTickets() {
    try {
      const response = await fetch('/api/tickets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to load tickets right now.');
      }

      setTickets(result.tickets ?? []);
    } catch (loadError) {
      console.error(loadError);
      setError('Unable to load tickets right now.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    loadTickets();
  }, [session]);

  const visibleTickets = useMemo(() => getVisibleTickets(tickets, session), [tickets, session]);

  const filteredTickets = useMemo(() => {
    if (activeFilter === 'all') {
      return visibleTickets;
    }

    return visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === activeFilter);
  }, [activeFilter, visibleTickets]);

  const summary = useMemo(
    () => ({
      open: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Open').length,
      inProgress: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'In Progress').length,
      resolved: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Resolved').length,
      total: visibleTickets.length,
    }),
    [visibleTickets],
  );

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    setFormError(null);
    setFormSuccess(null);
  };

  const loadTicketDetail = async (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    setDetailError(null);

    try {
      const response = await fetch(`/api/tickets/${ticketId}`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Could not load ticket details.');
      }

      const ticket = result.ticket ?? null;
      const description = ticket?.description ?? '';
      const noteMatch = description.match(/Owner notes:\n([\s\S]*)$/i);

      if (session?.role === 'tenant') {
        const allowed = description.toLowerCase().includes(`email: ${session.email.toLowerCase()}`);
        if (!allowed) {
          throw new Error('You can only view your own tickets.');
        }
      }

      setSelectedTicket(ticket);
      setStatusDraft(normalizeStatus(ticket?.status ?? 'Open'));
      setNoteDraft(noteMatch ? noteMatch[1].trim() : '');
    } catch (detailError) {
      console.error(detailError);
      setDetailError('Unable to load ticket details right now.');
      setSelectedTicket(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTicketUpdate = async (updates: { notes?: string; status?: string }) => {
    if (!selectedTicketId) {
      return;
    }

    setDetailSaving(true);
    setDetailError(null);

    try {
      const response = await fetch(`/api/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Ticket update failed.');
      }

      await loadTickets();
      await loadTicketDetail(selectedTicketId);
    } catch (updateError) {
      console.error(updateError);
      setDetailError(
        updateError instanceof Error && updateError.message
          ? updateError.message
          : 'Ticket update failed. Please try again.',
      );
    } finally {
      setDetailSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (session?.role === 'tenant') {
      setFormError('Tenants cannot create new maintenance requests from this view.');
      return;
    }

    const trimmedEmail = formState.email.trim();
    const trimmedAddress = formState.address.trim();
    const trimmedDescription = formState.description.trim();
    const numericSeverity = Number(formState.severity);

    if (!trimmedEmail || !trimmedAddress || !trimmedDescription || !formState.severity) {
      setFormError('Please complete the severity, email, address, and description fields.');
      return;
    }

    if (!Number.isInteger(numericSeverity) || numericSeverity < 1 || numericSeverity > 5) {
      setFormError('Severity must be a number from 1 to 5.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const priorityMap: Record<1 | 2 | 3 | 4 | 5, 'Low' | 'Medium' | 'High' | 'Emergency'> = {
      1: 'Low',
      2: 'Low',
      3: 'Medium',
      4: 'High',
      5: 'Emergency',
    };

    const priority = priorityMap[numericSeverity as 1 | 2 | 3 | 4 | 5];
    const status = 'Open';
    const title = trimmedDescription.length > 50 ? `${trimmedDescription.slice(0, 47)}...` : trimmedDescription;

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: `Email: ${trimmedEmail}\nAddress: ${trimmedAddress}\n\n${trimmedDescription}`,
          status,
          priority,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Ticket could not be submitted.');
      }

      setFormState(initialFormState);
      setShowForm(false);
      setFormSuccess('Ticket created successfully.');
      setLoading(true);
      await loadTickets();
    } catch (submitError) {
      console.error(submitError);
      const message = submitError instanceof Error && submitError.message
        ? submitError.message
        : 'Ticket could not be submitted. Please try again.';
      setFormError(message);
    } finally {
      setSubmitting(false);
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Landbaron.ai
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Maintenance tickets
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white">
              {getRoleLabel(session.role)}
            </div>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/login');
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </header>

        {session.role !== 'tenant' && (
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="mb-8 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
          >
            {showForm ? 'Close form' : 'New ticket'}
          </button>
        )}

        {showForm && session.role !== 'tenant' && (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Create a maintenance ticket</h2>

            <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Severity rating
                </label>
                <select
                  name="severity"
                  value={formState.severity}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-500"
                >
                  <option value="">Select severity</option>
                  <option value="1">1 - Nice to have</option>
                  <option value="2">2 - Minor issue</option>
                  <option value="3">3 - Important</option>
                  <option value="4">4 - Major issue</option>
                  <option value="5">5 - Unit is on fire / flooding</option>
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formState.email}
                  onChange={handleInputChange}
                  required
                  placeholder="tenant@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Property address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formState.address}
                  onChange={handleInputChange}
                  required
                  placeholder="123 Main St, Apt 4B, Springfield, IL"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description of issue
                </label>
                <textarea
                  name="description"
                  rows={5}
                  value={formState.description}
                  onChange={handleInputChange}
                  required
                  placeholder="Describe what is happening, when it started, and any symptoms or damage."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                />
              </div>

              {formError && (
                <div className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {formSuccess}
                </div>
              )}

              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormState(initialFormState);
                    setFormError(null);
                    setFormSuccess(null);
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit ticket'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total</p>
            <p className="mt-2 text-3xl font-semibold">{summary.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Open</p>
            <p className="mt-2 text-3xl font-semibold text-rose-600">{summary.open}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Resolved</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-600">{summary.resolved}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold">Ticket queue</h2>
              <div className="flex flex-wrap gap-2">
                {filterTabs.map((tab) => {
                  const isActive = activeFilter === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveFilter(tab.key)}
                      className={[
                        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading tickets...</div>
          ) : error ? (
            <div className="p-8 text-sm text-rose-600">{error}</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">
              {session.role === 'tenant'
                ? 'You do not have any tickets matching your account yet.'
                : 'No tickets found for this filter.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredTickets.map((ticket) => {
                const status = normalizeStatus(ticket.status);
                const displayPriority = normalizePriority(ticket.priority);

                return (
                  <article
                    key={ticket.id}
                    onClick={() => loadTicketDetail(ticket.id)}
                    className="cursor-pointer p-5 transition hover:bg-slate-50"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-slate-900">{ticket.title}</h3>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusStyles[status] ?? statusStyles.Open}`}
                          >
                            {labelMap[status] ?? status}
                          </span>
                        </div>

                        <p className="max-w-2xl text-sm text-slate-600">
                          {ticket.description ?? 'No description provided.'}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                            {ticket.category ?? 'General'}
                          </span>
                          <span>{displayPriority} priority</span>
                          <span>Updated {new Date(ticket.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="min-w-[180px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        <p className="font-medium text-slate-900">Ticket ID</p>
                        <p className="mt-1 break-all">{ticket.id}</p>
                        <p className="mt-3 font-medium text-slate-900">Property</p>
                        <p className="mt-1">{ticket.property_id ?? 'Unassigned'}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {selectedTicket && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Ticket details
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedTicket.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {detailLoading ? (
              <div className="text-sm text-slate-500">Loading ticket details...</div>
            ) : detailError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {detailError}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
                <div className="space-y-5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Description
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {selectedTicket.description ?? 'No issue description provided.'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Owner notes
                    </label>
                    <textarea
                      rows={5}
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Add internal notes for the owner or maintenance team..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    />
                    <div className="mt-3 flex justify-end">
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
                </div>

                <aside className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Status
                    </p>
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
                    <p className="mt-3 text-xs text-slate-500">
                      Updated {new Date(selectedTicket.updated_at).toLocaleDateString()}
                    </p>
                    {selectedTicket.resolved_at && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Resolved {new Date(selectedTicket.resolved_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Ticket info
                    </p>
                    <dl className="mt-3 space-y-2 text-sm text-slate-700">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Priority</dt>
                        <dd>{normalizePriority(selectedTicket.priority)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Category</dt>
                        <dd>{selectedTicket.category ?? 'General'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Property</dt>
                        <dd>{selectedTicket.property_id ?? 'Unassigned'}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleTicketUpdate({ status: statusDraft, notes: noteDraft })}
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
                </aside>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
