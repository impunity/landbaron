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
  assigned_to?: string | null;
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

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Maintenance' | 'Contractor';
  avatar_url?: string | null;
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
  Closed: 'Dismissed',
};

const filterTabs = [
  { key: 'all', label: 'All' },
  { key: 'Open', label: 'Open' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Resolved', label: 'Resolved' },
  { key: 'Closed', label: 'Dismissed' },
] as const;

type FilterKey = (typeof filterTabs)[number]['key'];

const normalizeStatus = (status?: string | null) => {
  if (!status) return 'Open';

  const value = status.trim();
  if (value.toLowerCase() === 'open') return 'Open';
  if (value.toLowerCase() === 'in progress') return 'In Progress';
  if (value.toLowerCase() === 'waiting on parts') return 'Waiting on Parts';
  if (value.toLowerCase() === 'resolved') return 'Resolved';
  if (value.toLowerCase() === 'closed' || value.toLowerCase() === 'dismissed') return 'Closed';

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
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const parsePhotoUrls = (description?: string | null) => {
  if (!description) return [];

  const matches = description.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[.,;!?]+$/, '')))].filter(Boolean);
};

const parseAssignmentFromDescription = (description?: string | null) => {
  if (!description) {
    return 'Unassigned';
  }

  const assignmentMatch = description.match(/(?:^|\n)Assigned to:\s*([^\n]+)/i);
  if (!assignmentMatch) {
    return 'Unassigned';
  }

  return assignmentMatch[1].trim();
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

const getTicketAssignmentLabel = (ticket?: Pick<TicketRow, 'assigned_to' | 'description'> | null) => {
  const directAssignment = ticket?.assigned_to?.trim();
  if (directAssignment) {
    return formatAssignmentLabel(directAssignment);
  }

  return formatAssignmentLabel(parseAssignmentFromDescription(ticket?.description ?? null));
};

const initialFormState: TicketFormState = {
  severity: '',
  email: '',
  address: '',
  description: '',
};

const getInitials = (name: string) => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'ST';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
};

const buildStaffAvatarPlaceholder = (name: string, role: StaffMember['role']) => {
  const initials = getInitials(name);
  const palette: Record<StaffMember['role'], string> = {
    Owner: '#111827',
    Maintenance: '#0f766e',
    Contractor: '#7c3aed',
  };

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${initials} avatar">
      <rect width="120" height="120" rx="60" fill="${palette[role] ?? '#334155'}" />
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial, sans-serif" font-size="36" font-weight="700">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const getStaffAvatarSource = (member: Pick<StaffMember, 'avatar_url' | 'name' | 'role'>) =>
  member.avatar_url || buildStaffAvatarPlaceholder(member.name, member.role);

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
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffHydrated, setStaffHydrated] = useState(false);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffSuccess, setStaffSuccess] = useState<string | null>(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffMember['role']>('Maintenance');
  const [editingStaff, setEditingStaff] = useState<{ email: string; name: string; role: StaffMember['role'] } | null>(null);

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

      setSessionState({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'Google User',
        email: sessionUser.email || '',
        role: getUserRoleByEmail(sessionUser.email),
      });
    };

    syncSession();

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
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

    const loadStaffMembers = async () => {
      if (session.role !== 'owner') {
        setStaffMembers([]);
        setStaffHydrated(true);
        loadTickets();
        return;
      }

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
      } catch (loadStaffError) {
        console.error(loadStaffError);
        setStaffMembers([]);
      } finally {
        setStaffHydrated(true);
        loadTickets();
      }
    };

    void loadStaffMembers();
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
      dismissed: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Closed').length,
      total: visibleTickets.length,
    }),
    [visibleTickets],
  );

  const propertySummary = useMemo(() => {
    const grouped = new Map<string, { count: number; active: number; open: number; resolved: number; dismissed: number }>();

    visibleTickets.forEach((ticket) => {
      const property = ticket.property_id?.trim() || 'Unassigned';
      const current = grouped.get(property) ?? { count: 0, active: 0, open: 0, resolved: 0, dismissed: 0 };
      const status = normalizeStatus(ticket.status);

      current.count += 1;
      if (status === 'Open') current.open += 1;
      if (status === 'Resolved') current.resolved += 1;
      if (status === 'Closed') current.dismissed += 1;
      if (status !== 'Resolved' && status !== 'Closed') {
        current.active += 1;
      }

      grouped.set(property, current);
    });

    return Array.from(grouped.entries())
      .map(([property, data]) => ({
        property,
        count: data.count,
        active: data.active,
        open: data.open,
        resolved: data.resolved,
        dismissed: data.dismissed,
      }))
      .sort((a, b) => b.active - a.active || b.count - a.count)
      .slice(0, 4);
  }, [visibleTickets]);

  const recentActivity = useMemo(
    () =>
      [...visibleTickets]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 4),
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

  const openTicketView = (ticketId: string) => {
    router.push(`/dashboard/tickets/${ticketId}`);
  };

  const handleAddStaffMember = async () => {
    const trimmedName = newStaffName.trim();
    const trimmedEmail = newStaffEmail.trim();

    if (!trimmedName || !trimmedEmail || session?.role !== 'owner') {
      setStaffError('Name, email, and owner access are required.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      setStaffError('Please enter a valid email address.');
      return;
    }

    setStaffSubmitting(true);
    setStaffError(null);
    setStaffSuccess(null);

    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': session.role,
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail.toLowerCase(),
          role: newStaffRole,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Staff could not be saved.');
      }

      const nextMember = result.staff as StaffMember | null;
      setStaffMembers((current: StaffMember[]) => {
        if (!nextMember) {
          return current;
        }

        const existingIndex = current.findIndex(
          (member: StaffMember) => member.email.toLowerCase() === nextMember.email.toLowerCase(),
        );

        if (existingIndex >= 0) {
          const updated = [...current];
          updated[existingIndex] = nextMember;
          return updated;
        }

        return [nextMember, ...current];
      });

      setStaffSuccess(`Added ${trimmedName} to the staff roster.`);
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffRole('Maintenance');
    } catch (staffError) {
      const message = staffError instanceof Error && staffError.message
        ? staffError.message
        : 'Staff could not be saved. Check that the staff_members table exists in Supabase.';
      setStaffError(message);
      console.error(staffError);
    } finally {
      setStaffSubmitting(false);
    }
  };

  const handleRemoveStaffMember = async (email: string) => {
    if (session?.role !== 'owner') {
      setStaffError('Only owners can remove staff members.');
      return;
    }

    setStaffError(null);
    setStaffSuccess(null);

    try {
      const response = await fetch(`/api/staff?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': session.role,
        },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || 'Staff member could not be removed.');
      }

      setStaffMembers((current: StaffMember[]) =>
        current.filter((member: StaffMember) => member.email.toLowerCase() !== email.toLowerCase()),
      );
      setStaffSuccess('Staff member removed.');
    } catch (removeError) {
      const message = removeError instanceof Error && removeError.message
        ? removeError.message
        : 'Staff member could not be removed.';
      setStaffError(message);
      console.error(removeError);
    }
  };

  const handleUpdateStaffMember = async (email: string, updates: Partial<Pick<StaffMember, 'name' | 'role' | 'avatar_url'>>) => {
    if (!session) {
      return;
    }

    const isOwner = session.role === 'owner';
    const isSelf = session.email.trim().toLowerCase() === email.trim().toLowerCase();
    const hasRoleNameUpdate = Object.prototype.hasOwnProperty.call(updates, 'name') || Object.prototype.hasOwnProperty.call(updates, 'role');

    if (!isOwner && !(isSelf && !hasRoleNameUpdate)) {
      setStaffError('Only the owner can edit staff names or roles, and only that staff member or the owner can update their avatar.');
      return;
    }

    setStaffError(null);
    setStaffSuccess(null);

    try {
      const response = await fetch('/api/staff', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
        body: JSON.stringify({
          email,
          ...updates,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Staff member could not be updated.');
      }

      const updatedMember = result.staff as StaffMember | null;
      setStaffMembers((current) =>
        current.map((member) =>
          member.email.toLowerCase() === email.toLowerCase() && updatedMember
            ? { ...member, ...updatedMember }
            : member,
        ),
      );

      setStaffSuccess('Staff member updated.');
    } catch (updateError) {
      const message = updateError instanceof Error && updateError.message
        ? updateError.message
        : 'Staff member could not be updated.';
      setStaffError(message);
      console.error(updateError);
    }
  };

  const handleRemoveStaffAvatar = async (email: string) => {
    if (!session) {
      return;
    }

    const isOwner = session.role === 'owner';
    const isSelf = session.email.trim().toLowerCase() === email.trim().toLowerCase();

    if (!isOwner && !isSelf) {
      setStaffError('Only the owner or that staff member can remove this avatar.');
      return;
    }

    await handleUpdateStaffMember(email, { avatar_url: null });
  };

  const handleStaffAvatarUpload = async (staffEmail: string, file?: File | null) => {
    if (!file || !session) {
      return;
    }

    const maxFileSize = 8 * 1024 * 1024;
    if (file.size > maxFileSize) {
      setStaffError('file must be under 8mb');
      return;
    }

    const canManageAvatar = session.role === 'owner' || session.email.trim().toLowerCase() === staffEmail.trim().toLowerCase();
    if (!canManageAvatar) {
      setStaffError('Only the owner or the staff member can update this avatar.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('email', staffEmail);

    setStaffError(null);
    setStaffSuccess(null);

    try {
      const response = await fetch('/api/staff/avatar', {
        method: 'POST',
        headers: {
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Avatar could not be updated.');
      }

      setStaffMembers((current) =>
        current.map((member) =>
          member.email.toLowerCase() === staffEmail.toLowerCase()
            ? { ...member, avatar_url: result.avatar_url ?? member.avatar_url }
            : member,
        ),
      );

      setStaffSuccess('Avatar updated successfully.');
    } catch (avatarError) {
      const message = avatarError instanceof Error && avatarError.message
        ? avatarError.message
        : 'Avatar could not be updated.';
      setStaffError(message);
      console.error(avatarError);
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
            {session.role === 'owner' && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/staff')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Staff roster
              </button>
            )}
            <div
              className={[
                'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]',
                session.role === 'owner'
                  ? 'bg-slate-900 text-white'
                  : session.role === 'maintenance' || session.role === 'contractor'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-200 text-slate-700',
              ].join(' ')}
            >
              {getRoleLabel(session.role)}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!supabase) {
                  router.push('/login');
                  return;
                }

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

        {session.role === 'owner' && (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Staff</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Who can be assigned</h2>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.8fr_auto]">
              <input
                value={newStaffName}
                onChange={(event) => setNewStaffName(event.target.value)}
                placeholder="Name"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
              />
              <input
                value={newStaffEmail}
                onChange={(event) => setNewStaffEmail(event.target.value)}
                placeholder="email@example.com"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
              />
              <select
                value={newStaffRole}
                onChange={(event) => setNewStaffRole(event.target.value as StaffMember['role'])}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option value="Maintenance">Maintenance</option>
                <option value="Contractor">Contractor</option>
                <option value="Owner">Owner</option>
              </select>
              <button
                type="button"
                onClick={handleAddStaffMember}
                disabled={staffSubmitting}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {staffSubmitting ? 'Saving...' : 'Add staff'}
              </button>
            </div>

            {(staffError || staffSuccess) && (
              <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${staffError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                {staffError ?? staffSuccess}
              </div>
            )}

            {session.role === 'owner' && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Staff management</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">Edit roster details</h3>
                  </div>
                  {editingStaff && (
                    <button
                      type="button"
                      onClick={() => setEditingStaff(null)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700"
                    >
                      Close
                    </button>
                  )}
                </div>

                {editingStaff ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-200">
                        <img
                          src={getStaffAvatarSource({
                            name: editingStaff.name,
                            role: editingStaff.role,
                            avatar_url:
                              staffMembers.find((member) => member.email.toLowerCase() === editingStaff.email.toLowerCase())
                                ?.avatar_url ?? null,
                          })}
                          alt={`${editingStaff.name} avatar preview`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{editingStaff.name}</p>
                        <p className="text-xs text-slate-500">{editingStaff.email}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                      <input
                        value={editingStaff.name}
                        onChange={(event) => setEditingStaff((current) => current ? { ...current, name: event.target.value } : current)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                        placeholder="Full name"
                      />

                      <select
                        value={editingStaff.role}
                        onChange={(event) => setEditingStaff((current) => current ? { ...current, role: event.target.value as StaffMember['role'] } : current)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                      >
                        <option value="Maintenance">Maintenance</option>
                        <option value="Contractor">Contractor</option>
                        <option value="Owner">Owner</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          if (!editingStaff) {
                            return;
                          }

                          void handleUpdateStaffMember(editingStaff.email, {
                            name: editingStaff.name,
                            role: editingStaff.role,
                          });
                        }}
                        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        Save changes
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100">
                        Upload avatar
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleStaffAvatarUpload(editingStaff.email, file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>

                      {staffMembers.find((member) => member.email.toLowerCase() === editingStaff.email.toLowerCase())?.avatar_url && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveStaffAvatar(editingStaff.email)}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50"
                        >
                          Remove avatar
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Choose a staff member to update their name, role, or avatar.</p>
                )}
              </div>
            )}

            {staffMembers.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {staffMembers.map((member) => {
                  const canManageAvatar = session?.role === 'owner' || session?.email?.trim().toLowerCase() === member.email.trim().toLowerCase();
                  const avatarSource = getStaffAvatarSource(member);

                  return (
                    <div key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <label className="group relative block h-12 w-12 cursor-pointer overflow-hidden rounded-full border border-slate-200 bg-slate-200 transition hover:opacity-90">
                            <img
                              src={avatarSource}
                              alt={`${member.name} avatar`}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-[9px] font-semibold uppercase tracking-[0.12em] text-white opacity-0 transition group-hover:opacity-100">
                              Edit
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  void handleStaffAvatarUpload(member.email, file);
                                }
                                event.target.value = '';
                              }}
                            />
                          </label>

                          <div>
                            <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                            {session?.role === 'owner' ? (
                              <select
                                value={member.role}
                                onChange={(event) => {
                                  const nextRole = event.target.value as StaffMember['role'];
                                  void handleUpdateStaffMember(member.email, { role: nextRole });
                                }}
                                className="mt-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none transition focus:border-slate-500"
                              >
                                <option value="Owner">Owner</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Contractor">Contractor</option>
                              </select>
                            ) : (
                              <span className="mt-2 inline-flex rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                {member.role}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          {session?.role === 'owner' && (
                            <button
                              type="button"
                              onClick={() => setEditingStaff({ email: member.email, name: member.name, role: member.role })}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100"
                            >
                              Manage
                            </button>
                          )}

                          {canManageAvatar && (
                            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  void handleStaffAvatarUpload(member.email, file);
                                  event.target.value = '';
                                }}
                              />
                            </label>
                          )}

                          {member.avatar_url && (session?.role === 'owner' || session?.email?.trim().toLowerCase() === member.email.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveStaffAvatar(member.email)}
                              className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50"
                            >
                              Remove avatar
                            </button>
                          )}

                          {session?.role === 'owner' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStaffMember(member.email)}
                              className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No staff added yet.</p>
            )}
          </section>
        )}

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            { key: 'all' as const, label: 'Total', value: summary.total, className: 'text-slate-900', badge: 'bg-slate-100 text-slate-700' },
            { key: 'Open' as const, label: 'Open', value: summary.open, className: 'text-rose-600', badge: 'bg-rose-100 text-rose-700' },
            { key: 'Resolved' as const, label: 'Resolved', value: summary.resolved, className: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
            { key: 'Closed' as const, label: 'Dismissed', value: summary.dismissed, className: 'text-slate-700', badge: 'bg-slate-200 text-slate-700' },
          ].map((card) => {
            const isActive = activeFilter === card.key;

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveFilter(card.key)}
                className={[
                  'rounded-2xl border p-5 text-left shadow-sm transition-all',
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={['text-sm', isActive ? 'text-slate-200' : 'text-slate-500'].join(' ')}>{card.label}</p>
                  <span className={['inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', card.badge, isActive ? 'bg-slate-700 text-slate-100' : ''].join(' ')}>
                    {card.key === 'all' ? 'All' : card.key}
                  </span>
                </div>
                <p className={['mt-2 text-3xl font-semibold', card.className, isActive ? 'text-white' : ''].join(' ')}>
                  {card.value}
                </p>
              </button>
            );
          })}
        </section>

        <section className="mb-8 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Portfolio snapshot
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Active property load</h2>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {propertySummary.map((entry) => (
                <div key={entry.property} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {entry.property}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-2xl font-semibold text-slate-900">{entry.count}</p>
                      <p className="text-xs text-slate-500">total issues</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                      {entry.active} active
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-medium text-slate-600">
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <div className="text-slate-900">{entry.open}</div>
                      <div>Open</div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <div className="text-emerald-700">{entry.resolved}</div>
                      <div>Resolved</div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <div className="text-slate-700">{entry.dismissed}</div>
                      <div>Dismissed</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recent activity
            </p>
            <div className="mt-4 space-y-3">
              {recentActivity.map((ticket) => {
                const assignmentLabel = getTicketAssignmentLabel(ticket);

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => openTicketView(ticket.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{ticket.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignmentLabel} • {normalizeStatus(ticket.status)}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(ticket.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                );
              })}
            </div>
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
                const assignmentLabel = getTicketAssignmentLabel(ticket);

                return (
                  <article
                    key={ticket.id}
                    onClick={() => openTicketView(ticket.id)}
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
                          {sanitizeTicketDescription(ticket.description) || 'No description provided.'}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                            {ticket.category ?? 'General'}
                          </span>
                          <span>{displayPriority} priority</span>
                          <span>Assigned: {assignmentLabel}</span>
                          <span>Updated {new Date(ticket.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="min-w-[180px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        <p className="font-medium text-slate-900">Ticket ID</p>
                        <p className="mt-1 break-all">{ticket.id}</p>
                        <p className="mt-3 font-medium text-slate-900">Assigned</p>
                        <p className="mt-1">{assignmentLabel}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
