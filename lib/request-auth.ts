import { getUserRoleByEmail, type UserRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlatformAdminEmail } from '@/lib/platform-admin-auth';

export type AuthenticatedRequestUser = {
  id: string;
  email: string;
  role: UserRole;
  isPlatformAdmin: boolean;
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

    if (role === 'tenant') {
      try {
        const { data: organization } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .or(`owner_user_id.eq.${data.user.id},owner_email.ilike.${email}`)
          .limit(1)
          .maybeSingle();

        if (organization) {
          role = 'owner';
        }
      } catch {
        // Preserve the existing fallback when the organizations migration is unavailable.
      }
    }
  }

  return {
    id: data.user.id,
    email,
    role,
    isPlatformAdmin: isPlatformAdminEmail(email),
  } satisfies AuthenticatedRequestUser;
}