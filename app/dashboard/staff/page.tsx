'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getRoleLabel, getUserRoleByEmail, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Maintenance' | 'Contractor';
  avatar_url?: string | null;
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

export default function StaffPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionUser | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleStaffAvatarUpload = async (staffEmail: string, file?: File | null) => {
    if (!file || !session) {
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('file must be under 8mb');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('email', staffEmail);

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

      setStaff((current) =>
        current.map((member) =>
          member.email.toLowerCase() === staffEmail.toLowerCase()
            ? { ...member, avatar_url: result.avatar_url ?? member.avatar_url }
            : member,
        ),
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Avatar could not be updated.');
      console.error(uploadError);
    }
  };

  const handleStaffRoleChange = async (staffEmail: string, role: StaffMember['role']) => {
    if (!session || session.role !== 'owner') {
      return;
    }

    try {
      const response = await fetch('/api/staff', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': session.role,
          'x-user-email': session.email,
        },
        body: JSON.stringify({ email: staffEmail, role }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Role could not be updated.');
      }

      setStaff((current) =>
        current.map((member) =>
          member.email.toLowerCase() === staffEmail.toLowerCase() && result.staff
            ? { ...member, ...result.staff }
            : member,
        ),
      );
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Role could not be updated.');
      console.error(roleError);
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

      const nextSession: SessionUser = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'Google User',
        email: sessionUser.email || '',
        role: getUserRoleByEmail(sessionUser.email),
      };

      setSessionState(nextSession);

      if (nextSession.role !== 'owner') {
        router.replace('/dashboard');
      }
    };

    syncSession();

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user;

      if (!nextUser) {
        setSessionState(null);
        router.replace('/login');
        return;
      }

      const nextSessionUser: SessionUser = {
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'Google User',
        email: nextUser.email || '',
        role: getUserRoleByEmail(nextUser.email),
      };

      setSessionState(nextSessionUser);

      if (nextSessionUser.role !== 'owner') {
        router.replace('/dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!session || session.role !== 'owner') {
      return;
    }

    const loadStaff = async () => {
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Landbaron.ai</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Staff roster</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white">
              {getRoleLabel(session.role)}
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to dashboard
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
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
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Avatar</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Role</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {staff.map((member) => {
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
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <select
                          value={member.role}
                          onChange={(event) => {
                            const nextRole = event.target.value as StaffMember['role'];
                            void handleStaffRoleChange(member.email, nextRole);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                        >
                          <option value="Owner">Owner</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Contractor">Contractor</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {staff.length === 0 && (
              <div className="p-8 text-sm text-slate-500">No staff members have been added yet.</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
