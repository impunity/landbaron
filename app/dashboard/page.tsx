'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, getVisibleTickets, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { TenantPortal } from './tenant-portal';

type TicketStatus = 'Open' | 'In Progress' | 'Waiting on Parts' | 'Resolved' | 'Closed' | 'Archived';

type TicketRow = {
  id: string;
  ticket_number?: number | null;
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
  opened_by_label?: string | null;
};

type TicketFormState = {
  severity: string;
  email: string;
  address: string;
  description: string;
  assigned_to: string;
  property_id: string;
  unit_id: string;
};

type PropertyOption = {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  units?: Array<{
    id: string;
    unit_number: string;
    tenants?: Array<{ id: string; name: string; email?: string | null }>;
  }>;
};

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Manager' | 'Maintenance' | 'Contractor';
  avatar_url?: string | null;
};

const statusStyles: Record<string, string> = {
  Open: 'bg-rose-100 text-rose-700 ring-rose-200',
  'In Progress': 'bg-amber-100 text-amber-700 ring-amber-200',
  'Waiting on Parts': 'bg-sky-100 text-sky-700 ring-sky-200',
  Resolved: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Closed: 'bg-slate-200 text-slate-700 ring-slate-300',
  Archived: 'bg-stone-200 text-stone-700 ring-stone-300',
};

const labelMap: Record<string, string> = {
  Open: 'Open',
  'In Progress': 'In Progress',
  'Waiting on Parts': 'Waiting on Parts',
  Resolved: 'Resolved',
  Closed: 'Dismissed',
  Archived: 'Archived',
};

const filterTabs = [
  { key: 'all', label: 'All' },
  { key: 'Open', label: 'Open' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Resolved', label: 'Resolved' },
  { key: 'Closed', label: 'Dismissed' },
  { key: 'Archived', label: 'Archived' },
] as const;

const sortOptions = [
  { key: 'date', label: 'Date' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'assigned', label: 'Assigned person' },
] as const;

type FilterKey = (typeof filterTabs)[number]['key'];
type SortKey = (typeof sortOptions)[number]['key'];

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
    .replace(/(^|\n)\s*Email:\s*[^\n]*$/gim, '$1')
    .replace(/(^|\n)\s*Address:\s*[^\n]*$/gim, '$1')
    .replace(/(^|\n)\s*Assigned to:\s*[^\n]*$/gim, '$1')
    .replace(/(^|\n)\s*Photo:\s*[^\n]*$/gim, '$1')
    .replace(/(^|\n)\s*Video:\s*[^\n]*$/gim, '$1')
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const parsePhotoUrls = (description?: string | null) => {
  if (!description) return [];

  const entries: Array<{ label: string; url: string; type: 'image' | 'video' }> = [];

  for (const line of description.split(/\n+/)) {
    const attachmentMatch = line.match(/^(Photo|Video):\s*.*?\s*\|\s*(https?:\/\/[^\s)]+)\s*$/i);
    if (attachmentMatch) {
      const labelMatch = line.match(/^(Photo|Video):\s*(.*?)\s*\|\s*(https?:\/\/[^\s)]+)\s*$/i);
      entries.push({
        label: labelMatch?.[2]?.trim() || 'Attachment',
        url: attachmentMatch[2].replace(/[.,;!?]+$/, ''),
        type: attachmentMatch[1].toLowerCase() === 'video' ? 'video' : 'image',
      });
    }
  }

  return entries.filter((entry, index, allEntries) => allEntries.findIndex((candidate) => candidate.url === entry.url) === index);
};

const getFallbackTicketNumber = (id: string) => {
  const digits = id.replace(/\D/g, '').slice(-5);
  return digits.padStart(5, '0');
};

const formatTicketNumber = (ticket: Pick<TicketRow, 'id' | 'ticket_number'>) => (
  `#${String(ticket.ticket_number ?? getFallbackTicketNumber(ticket.id)).padStart(5, '0')}`
);

const getTicketLocationLabel = (
  ticket: Pick<TicketRow, 'property_id' | 'unit_id'>,
  properties: PropertyOption[],
) => {
  const property = properties.find((item) => item.id === ticket.property_id);
  const unit = property?.units?.find((item) => item.id === ticket.unit_id);
  const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : '';

  return [unitLabel, property?.name].filter(Boolean).join(' / ');
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

const parseReporterEmailFromDescription = (description?: string | null) => {
  if (!description) {
    return '';
  }

  const reporterMatch = description.match(/(?:^|\n)Email:\s*([^\n]+)/i);
  return reporterMatch?.[1]?.trim().toLowerCase() ?? '';
};

const getTicketReporterLabel = (
  ticket: Pick<TicketRow, 'description' | 'unit_id'>,
  properties: PropertyOption[],
) => {
  if ('opened_by_label' in ticket && typeof ticket.opened_by_label === 'string' && ticket.opened_by_label.trim()) {
    return ticket.opened_by_label.trim();
  }

  const reporterEmail = parseReporterEmailFromDescription(ticket.description);
  const unitTenants = properties
    .flatMap((property) => property.units ?? [])
    .filter((unit) => unit.id === ticket.unit_id)
    .flatMap((unit) => unit.tenants ?? []);

  if (reporterEmail) {
    const tenant = unitTenants.find((candidate) => candidate.email?.trim().toLowerCase() === reporterEmail);
    return tenant?.name || 'Unknown';
  }

  if (unitTenants.length === 1) {
    return unitTenants[0].name;
  }

  return 'Unknown';
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
  assigned_to: '',
  property_id: '',
  unit_id: '',
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
    Manager: '#334155',
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

const severityOrder: Record<string, number> = {
  Emergency: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  '': 1,
};

const statusOrder: Record<string, number> = {
  Open: 1,
  'In Progress': 2,
  'Waiting on Parts': 3,
  Resolved: 4,
  Closed: 5,
  Archived: 6,
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
  const [ticketPhotos, setTicketPhotos] = useState<File[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('date');
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

  async function loadTickets() {
    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/tickets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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

  async function loadPropertyOptions() {
    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;
      if (!accessToken) return;

      const response = await fetch('/api/properties', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        const properties = Array.isArray(result.properties) ? result.properties as PropertyOption[] : [];
        setPropertyOptions(properties);

        const params = new URLSearchParams(window.location.search);
        const propertyId = params.get('propertyId') ?? '';
        const unitId = params.get('unitId') ?? '';
        const property = properties.find((item) => item.id === propertyId);
        if (property) {
          const unit = property.units?.find((item) => item.id === unitId);
          const tenantEmail = unit?.tenants?.find((tenant) => tenant.email)?.email ?? '';
          const address = [property.address, unit?.unit_number && `Unit ${unit.unit_number}`]
            .filter(Boolean)
            .join(', ');
          setFormState((current) => ({
            ...current,
            property_id: propertyId,
            unit_id: unitId,
            email: tenantEmail,
            address,
          }));
          setShowForm(true);
        }
      }
    } catch (propertyError) {
      console.error(propertyError);
      setPropertyOptions([]);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    const loadStaffMembers = async () => {
      if (session.role !== 'owner' && session.role !== 'manager') {
        setStaffMembers([]);
        setStaffHydrated(true);
        if (session.role !== 'tenant') {
          await loadPropertyOptions();
        }
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
        await loadPropertyOptions();
        setStaffHydrated(true);
        loadTickets();
      }
    };

    void loadStaffMembers();
  }, [session]);

  const visibleTickets = useMemo(() => getVisibleTickets(tickets, session), [tickets, session]);

  const nonArchivedTickets = useMemo(
    () => visibleTickets.filter((ticket) => normalizeStatus(ticket.status) !== 'Archived'),
    [visibleTickets],
  );

  const filteredTickets = useMemo(() => {
    if (activeFilter === 'all') {
      return nonArchivedTickets;
    }

    return visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === activeFilter);
  }, [activeFilter, nonArchivedTickets, visibleTickets]);

  const sortedTickets = useMemo(() => {
    const next = [...filteredTickets];

    next.sort((a, b) => {
      if (sortBy === 'severity') {
        const severityDifference = (severityOrder[normalizePriority(b.priority)] ?? 0) - (severityOrder[normalizePriority(a.priority)] ?? 0);
        if (severityDifference !== 0) {
          return severityDifference;
        }
      }

      if (sortBy === 'status') {
        const statusDifference = (statusOrder[normalizeStatus(b.status)] ?? 99) - (statusOrder[normalizeStatus(a.status)] ?? 99);
        if (statusDifference !== 0) {
          return statusDifference;
        }
      }

      if (sortBy === 'assigned') {
        const assignedDifference = getTicketAssignmentLabel(b).localeCompare(getTicketAssignmentLabel(a));
        if (assignedDifference !== 0) {
          return assignedDifference;
        }
      }

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return next;
  }, [filteredTickets, sortBy]);

  const summary = useMemo(
    () => ({
      open: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Open').length,
      inProgress: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'In Progress').length,
      resolved: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Resolved').length,
      dismissed: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Closed').length,
      archived: visibleTickets.filter((ticket) => normalizeStatus(ticket.status) === 'Archived').length,
      total: nonArchivedTickets.length,
    }),
    [nonArchivedTickets, visibleTickets],
  );

  const propertySummary = useMemo(() => {
    const grouped = new Map<string, { count: number; active: number; open: number; resolved: number; dismissed: number }>();

    nonArchivedTickets.forEach((ticket) => {
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
  }, [nonArchivedTickets]);

  const recentActivity = useMemo(
    () =>
      [...nonArchivedTickets]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 4),
    [nonArchivedTickets],
  );

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    setFormError(null);
    setFormSuccess(null);
  };

  const handleTicketPhotosChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTicketPhotos(Array.from(event.target.files ?? []));
    setFormError(null);
  };

  const openTicketView = (ticketId: string) => {
    router.push(`/dashboard/tickets/${ticketId}`);
  };

  const handleAddStaffMember = async () => {
    const trimmedName = newStaffName.trim();
    const trimmedEmail = newStaffEmail.trim();

    if (!trimmedName || !trimmedEmail || (session?.role !== 'owner' && session?.role !== 'manager')) {
      setStaffError('Name, email, and owner or manager access are required.');
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
    if (session?.role !== 'owner' && session?.role !== 'manager') {
      setStaffError('Only owners or managers can remove staff members.');
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

    const isOwner = session.role === 'owner' || session.role === 'manager';
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

    const isOwner = session.role === 'owner' || session.role === 'manager';
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

    const canManageAvatar = session.role === 'owner' || session.role === 'manager' || session.email.trim().toLowerCase() === staffEmail.trim().toLowerCase();
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

    if (!session) {
      setFormError('Sign in is required.');
      return;
    }

    const trimmedEmail = session.role === 'tenant' ? session.email.trim() : formState.email.trim();
    const trimmedAddress = formState.address.trim();
    const trimmedDescription = formState.description.trim();
    const assignedTo = formState.assigned_to.trim();
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
    const descriptionParts = [
      `Email: ${trimmedEmail}`,
      `Address: ${trimmedAddress}`,
    ];

    if (assignedTo) {
      descriptionParts.push(`Assigned to: ${assignedTo}`);
    }

    descriptionParts.push(trimmedDescription);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      if (!accessToken) {
        throw new Error('Sign in is required.');
      }

      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title,
          description: descriptionParts.join('\n\n'),
          status,
          priority,
          assigned_to: assignedTo || null,
          property_id: formState.property_id || null,
          unit_id: formState.unit_id || null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'Ticket could not be submitted.');
      }

      const ticketId = typeof result.ticket?.id === 'string' ? result.ticket.id : '';
      if (ticketPhotos.length > 0 && ticketId) {
        for (const photo of ticketPhotos) {
          const photoData = new FormData();
          photoData.append('file', photo);

          const photoResponse = await fetch(`/api/tickets/${ticketId}/photos`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: photoData,
          });

          if (!photoResponse.ok) {
            const photoResult = await photoResponse.json().catch(() => ({}));
            throw new Error(photoResult?.error || 'Ticket created, but one or more photos could not be uploaded.');
          }
        }
      }

      setFormState(initialFormState);
      setTicketPhotos([]);
      setShowForm(false);
      setFormSuccess(
        result.notificationError
          ? `Ticket created successfully. ${result.notificationError}`
          : result.notificationSent
            ? 'Ticket created successfully. Email notification accepted by Resend.'
            : 'Ticket created successfully.',
      );
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

  if (session.role === 'tenant') {
    return <TenantPortal session={session} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              LANDBARON
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Maintenance tickets
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/properties')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Properties & Units
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/tenants')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Tenants
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/vendors')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Approved Vendors
                </button>
            </>
            {(session.role === 'owner' || session.role === 'manager') && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/staff')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Staff roster
              </button>
            )}
            {(session.role === 'owner' || session.role === 'manager') && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/analysis')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Analysis
              </button>
            )}
          </div>
        </header>

        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="mb-8 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
        >
          {showForm ? 'Close form' : 'New ticket'}
        </button>

        {!showForm && formSuccess && (
          <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {formSuccess}
          </div>
        )}

        {showForm && (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Create a maintenance ticket</h2>

            <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
              <div className="space-y-5">
                <>
                    <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Property</label>
                    <select
                      name="property_id"
                      value={formState.property_id}
                      onChange={(event) => {
                        const property = propertyOptions.find((item) => item.id === event.target.value);
                        setFormState((current) => ({
                          ...current,
                          property_id: event.target.value,
                          unit_id: '',
                          email: '',
                          address: property?.address ?? '',
                        }));
                      }}
                      required
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="">Select property</option>
                      {propertyOptions.map((property) => (
                        <option key={property.id} value={property.id}>{property.name} — {property.address}</option>
                      ))}
                    </select>
                    </div>
                    <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Unit</label>
                    <select
                      name="unit_id"
                      value={formState.unit_id}
                      onChange={(event) => {
                        const property = propertyOptions.find((item) => item.id === formState.property_id);
                        const unit = property?.units?.find((item) => item.id === event.target.value);
                        const tenantEmail = unit?.tenants?.find((tenant) => tenant.email)?.email ?? '';
                        setFormState((current) => ({
                          ...current,
                          unit_id: event.target.value,
                          email: tenantEmail,
                          address: [property?.address, unit?.unit_number && `Unit ${unit.unit_number}`].filter(Boolean).join(', '),
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="">No specific unit</option>
                      {propertyOptions.find((property) => property.id === formState.property_id)?.units?.map((unit) => (
                        <option key={unit.id} value={unit.id}>Unit {unit.unit_number}</option>
                      ))}
                    </select>
                    </div>
                </>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tenant Email</label>
                  <select name="email" value={formState.email} onChange={handleInputChange} required disabled={!formState.property_id} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:bg-slate-100">
                      <option value="">{formState.property_id ? 'Select tenant email' : 'Select a property first'}</option>
                      {propertyOptions
                        .find((property) => property.id === formState.property_id)
                        ?.units?.filter((unit) => !formState.unit_id || unit.id === formState.unit_id)
                        .flatMap((unit) => unit.tenants ?? [])
                        .filter((tenant) => tenant.email)
                        .map((tenant) => (
                        <option key={tenant.id} value={tenant.email ?? ''}>{tenant.name} — {tenant.email}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="space-y-5">
                {(session.role === 'owner' || session.role === 'manager') && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Assigned To</label>
                    <select name="assigned_to" value={formState.assigned_to} onChange={handleInputChange} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500">
                      <option value="">Unassigned</option>
                      {staffMembers.map((member) => <option key={member.id} value={`${member.name} <${member.email}>`}>{member.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Severity</label>
                  <select name="severity" value={formState.severity} onChange={handleInputChange} required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500">
                    <option value="">Select severity</option>
                    <option value="1">1 - Nice to have</option><option value="2">2 - Minor issue</option><option value="3">3 - Important</option><option value="4">4 - Major issue</option><option value="5">5 - Unit is on fire / flooding</option>
                  </select>
                </div>
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
                  readOnly
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

              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Photos/Videos</label>
                  <span className="text-xs text-slate-500">
                    Images or videos • Max 25MB per file
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleTicketPhotosChange}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
                />
                {ticketPhotos.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {ticketPhotos.length} file{ticketPhotos.length === 1 ? '' : 's'} selected
                  </p>
                )}
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
                    setTicketPhotos([]);
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

        <section className="mb-8 grid gap-4 md:grid-cols-5">
          {[
            { key: 'all' as const, label: 'Total', value: summary.total, className: 'text-slate-900', badge: 'bg-slate-100 text-slate-700' },
            { key: 'Open' as const, label: 'Open', value: summary.open, className: 'text-rose-600', badge: 'bg-rose-100 text-rose-700' },
            { key: 'Resolved' as const, label: 'Resolved', value: summary.resolved, className: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
            { key: 'Closed' as const, label: 'Dismissed', value: summary.dismissed, className: 'text-slate-700', badge: 'bg-slate-200 text-slate-700' },
            { key: 'Archived' as const, label: 'Archived', value: summary.archived, className: 'text-stone-700', badge: 'bg-stone-200 text-stone-700' },
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

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold">Ticket queue</h2>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
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

                <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as SortKey)}
                    className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading tickets...</div>
          ) : error ? (
            <div className="p-8 text-sm text-rose-600">{error}</div>
          ) : sortedTickets.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">No tickets found for this filter.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {sortedTickets.map((ticket) => {
                const status = normalizeStatus(ticket.status);
                const displayPriority = normalizePriority(ticket.priority);
                const reporterLabel = getTicketReporterLabel(ticket, propertyOptions);
                const locationLabel = getTicketLocationLabel(ticket, propertyOptions);
                const attachmentEntries = parsePhotoUrls(ticket.description);

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

                        {attachmentEntries.length > 0 && (
                          <div className="flex max-w-2xl flex-wrap gap-2">
                            {attachmentEntries.slice(0, 8).map((attachment) => (
                              <div key={attachment.url} className="w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                <div className="h-16 w-full">
                                  {attachment.type === 'video' ? (
                                    <video src={attachment.url} className="h-full w-full object-cover" muted playsInline />
                                  ) : (
                                    <img src={attachment.url} alt={attachment.label} className="h-full w-full object-cover" />
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openTicketView(ticket.id);
                                  }}
                                  className="block w-full bg-white px-2 py-1 text-left text-[11px] font-medium text-slate-600 hover:text-slate-900"
                                >
                                  Add/edit description
                                </button>
                              </div>
                            ))}
                            {attachmentEntries.length > 8 && (
                              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                                +{attachmentEntries.length - 8}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {locationLabel && <span>{locationLabel}</span>}
                          <span>Filed by: {reporterLabel}</span>
                          <span>{displayPriority} priority</span>
                          <span>Updated {new Date(ticket.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="min-w-[180px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        <p className="font-medium text-slate-900">Ticket number</p>
                        <p className="mt-1">{formatTicketNumber(ticket)}</p>
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
