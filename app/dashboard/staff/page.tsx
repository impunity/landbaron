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
                        <img src={avatarSource} alt={`${member.name} avatar`} className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200" />
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{member.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{member.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{member.role}</td>
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
