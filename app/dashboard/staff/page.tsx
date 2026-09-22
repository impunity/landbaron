'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, getUserRoleByEmail, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone_number?: string | null;
  role: 'Owner' | 'Manager' | 'Maintenance' | 'Contractor';
  avatar_url?: string | null;
};

type StaffDraft = {
  name: string;
  email: string;
  phone_number: string;
  role: StaffMember['role'];
};

const buildStaffAvatarPlaceholder = (name: string, role: StaffMember['role']) => {
  const initials = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'ST';

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

const makeEmptyDraft = (): StaffDraft => ({
  name: '',
  email: '',
  phone_number: '',
  role: 'Maintenance',
});

export default function StaffPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStaff, setNewStaff] = useState<StaffDraft>(makeEmptyDraft());
  const [newStaffSubmitting, setNewStaffSubmitting] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editingDraft, setEditingDraft] = useState<StaffDraft | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<StaffMember | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [removingMember, setRemovingMember] = useState(false);

  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)),
    [staff],
  );

  const handleAddStaffMember = async () => {
    if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
      setError('Owner or manager access is required to add staff members.');
      return;
    }

    const trimmedName = newStaff.name.trim();
    const trimmedEmail = newStaff.email.trim();
    const trimmedPhone = newStaff.phone_number.trim();

    if (!trimmedName || !trimmedEmail) {
      setError('Name and email are required.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setNewStaffSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail.toLowerCase(),
          phone_number: trimmedPhone,
          role: newStaff.role,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Staff member could not be added.');
      }

      const nextMember = result.staff as StaffMember | null;
      if (nextMember) {
        setStaff((current) => {
          const existingIndex = current.findIndex(
            (member) => member.email.toLowerCase() === nextMember.email.toLowerCase(),
          );

          if (existingIndex >= 0) {
            const updated = [...current];
            updated[existingIndex] = nextMember;
            return updated;
          }

          return [nextMember, ...current];
        });
      }

      setNewStaff(makeEmptyDraft());
      setSuccess(`Added ${trimmedName} to the staff roster.`);
      setShowAddForm(false);
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : 'Staff member could not be added.';
      setError(message);
      console.error(addError);
    } finally {
      setNewStaffSubmitting(false);
    }
  };

  const handleUpdateStaffMember = async (currentEmail: string, updates: Partial<StaffDraft>) => {
    if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
      setError('Owner or manager access is required to update staff members.');
      return;
    }

    setSavingChanges(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      const payload = {
        current_email: currentEmail,
        name: updates.name ?? '',
        email: updates.email ?? currentEmail,
        phone_number: updates.phone_number ?? '',
        role: updates.role ?? 'Maintenance',
      };

      const response = await fetch('/api/staff', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Staff member could not be updated.');
      }

      const nextMember = result.staff as StaffMember | null;
      setStaff((current) => {
        const filtered = current.filter((member) => member.email.toLowerCase() !== currentEmail.toLowerCase());
        if (!nextMember) {
          return filtered;
        }
        return [nextMember, ...filtered].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
      });

      setSuccess(`${updates.name || editingMember?.name || 'Staff member'} was updated.`);
      setEditingMember(null);
      setEditingDraft(null);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Staff member could not be updated.';
      setError(message);
      console.error(updateError);
    } finally {
      setSavingChanges(false);
    }
  };

  const handleRemoveStaffMember = async () => {
    if (!session || (session.role !== 'owner' && session.role !== 'manager') || !deleteCandidate) {
      return;
    }

    setRemovingMember(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const accessToken = authData.session?.access_token;

      const response = await fetch(`/api/staff?email=${encodeURIComponent(deleteCandidate.email)}`, {
        method: 'DELETE',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Staff member could not be removed.');
      }

      setStaff((current) => current.filter((member) => member.email.toLowerCase() !== deleteCandidate.email.toLowerCase()));
      setSuccess(`${deleteCandidate.name} was removed from the roster.`);
      setDeleteCandidate(null);
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Staff member could not be removed.';
      setError(message);
      console.error(removeError);
    } finally {
      setRemovingMember(false);
    }
  };

  const handleStaffAvatarUpload = async (staffEmail: string, file?: File | null) => {
    if (!file || !session) {
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('file must be under 8mb');
      return;
    }

    const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const accessToken = authData.session?.access_token;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('email', staffEmail);

    try {
      const response = await fetch('/api/staff/avatar', {
        method: 'POST',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Avatar could not be updated.');
      }

      setStaff((current) =>
        current.map((member) =>
          member.email.toLowerCase() === staffEmail.toLowerCase()
            ? { ...member, avatar_url: result.avatar_url ?? member.avatar_url }
            : member,
        ),
      );
      setSuccess('Avatar updated successfully.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Avatar could not be updated.');
      console.error(uploadError);
    }
  };

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

      const nextSession: SessionUser = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'Google User',
        email: sessionUser.email || '',
        role,
      };

      setSessionState(nextSession);
      if (nextSession.role !== 'owner' && nextSession.role !== 'manager') {
        router.replace('/dashboard');
      }
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

      const nextSessionUser: SessionUser = {
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'Google User',
        email: nextUser.email || '',
        role,
      };

      setSessionState(nextSessionUser);
      if (nextSessionUser.role !== 'owner' && nextSessionUser.role !== 'manager') {
        router.replace('/dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
      return;
    }

    const loadStaff = async () => {
      try {
        const { data: authData } = await supabase?.auth.getSession() ?? { data: { session: null } };
        const accessToken = authData.session?.access_token;

        const response = await fetch('/api/staff', {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            'x-user-role': session.role,
            'x-user-email': session.email,
          },
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.error || 'Unable to load staff members.');
        }

        setStaff(Array.isArray(result.staff) ? result.staff : []);
      } catch (loadError) {
        console.error(loadError);
        setError('Unable to load staff roster right now.');
      } finally {
        setLoading(false);
      }
    };

    void loadStaff();
  }, [session]);

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Staff Roster', href: '/dashboard/staff' }]} />
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Staff roster</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DashboardNavButtons current="staff" role={session.role} />
            <button
              type="button"
              onClick={() => setShowAddForm((current) => !current)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-slate-800"
            >
              ADD STAFF
            </button>
          </div>
        </header>

        {showAddForm && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Add staff member</h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">Name</span>
                <input
                  type="text"
                  value={newStaff.name}
                  onChange={(event) => setNewStaff((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  placeholder="Jane Smith"
                />
              </label>

              <label className="text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  value={newStaff.email}
                  onChange={(event) => setNewStaff((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  placeholder="jane@example.com"
                />
              </label>

              <label className="text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">Phone</span>
                <input
                  type="tel"
                  value={newStaff.phone_number}
                  onChange={(event) => setNewStaff((current) => ({ ...current, phone_number: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  placeholder="(555) 123-4567"
                />
              </label>

              <label className="text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">Role</span>
                <select
                  value={newStaff.role}
                  onChange={(event) => setNewStaff((current) => ({ ...current, role: event.target.value as StaffMember['role'] }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                >
                  <option value="Owner">Owner</option>
                  <option value="Manager">Manager</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Contractor">Contractor</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewStaff(makeEmptyDraft());
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddStaffMember()}
                disabled={newStaffSubmitting}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {newStaffSubmitting ? 'Saving...' : 'Save member'}
              </button>
            </div>
          </div>
        )}

        {editingMember && editingDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-900">Edit staff member</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(null);
                    setEditingDraft(null);
                  }}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    value={editingDraft.name}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={editingDraft.email}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current ? { ...current, email: event.target.value } : current,
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={editingDraft.phone_number}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current ? { ...current, phone_number: event.target.value } : current,
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
                  <select
                    value={editingDraft.role}
                    onChange={(event) =>
                      setEditingDraft((current) =>
                        current
                          ? { ...current, role: event.target.value as StaffMember['role'] }
                          : current,
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                  >
                    <option value="Owner">Owner</option>
                    <option value="Manager">Manager</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Contractor">Contractor</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(null);
                    setEditingDraft(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!editingMember || !editingDraft) {
                      return;
                    }
                    void handleUpdateStaffMember(editingMember.email, {
                      name: editingDraft.name,
                      email: editingDraft.email,
                      phone_number: editingDraft.phone_number,
                      role: editingDraft.role,
                    });
                  }}
                  disabled={savingChanges}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingChanges ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            Loading staff roster...
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <div>Avatar</div>
                    <div className="text-[10px] font-normal lowercase tracking-normal text-slate-400">JPG/PNG/WEBP • Max 8MB</div>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Phone</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {sortedStaff.map((member) => {
                  const avatarSource = getStaffAvatarSource(member);

                  return (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <label className="relative block h-12 w-12 cursor-pointer overflow-hidden rounded-full ring-1 ring-slate-200 transition hover:opacity-90">
                          <img src={avatarSource} alt={`${member.name} avatar`} className="h-full w-full object-cover" />
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
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{member.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{member.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{member.phone_number?.trim() || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMember(member);
                              setEditingDraft({
                                name: member.name,
                                email: member.email,
                                phone_number: member.phone_number || '',
                                role: member.role,
                              });
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(member)}
                            className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {sortedStaff.length === 0 && (
              <div className="p-8 text-sm text-slate-500">No staff members have been added yet.</div>
            )}
          </div>
        )}
      </div>

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Confirm removal</p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">Remove {deleteCandidate.name}?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This will remove the staff member from the roster and revoke their assignment access.
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRemoveStaffMember()}
                disabled={removingMember}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                {removingMember ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
