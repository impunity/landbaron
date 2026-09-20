import { getUserRoleByEmail, type UserRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type AuthenticatedRequestUser = {
  id: string;
  email: string;
  role: UserRole;
};

export async function getAuthenticatedRequestUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!token || !supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) {
    return null;
  }

  const email = data.user.email.toLowerCase();
  let role: UserRole = getUserRoleByEmail(email);

  if (role !== 'owner' && supabaseAdmin) {
    try {
      const { data: staffData } = await supabaseAdmin
        .from('staff_members')
        .select('role')
        .ilike('email', email)
        .maybeSingle();

      if (staffData?.role) {
        const r = String(staffData.role).toLowerCase();
        if (r === 'owner') role = 'owner';
        else if (r === 'manager') role = 'manager';
        else if (r === 'maintenance') role = 'maintenance';
        else if (r === 'contractor') role = 'contractor';
      }
    } catch {
      // fallback
    }
  }

  return {
    id: data.user.id,
    email,
    role,
  } satisfies AuthenticatedRequestUser;
}