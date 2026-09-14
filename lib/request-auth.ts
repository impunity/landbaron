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

  return {
    id: data.user.id,
    email: data.user.email.toLowerCase(),
    role: getUserRoleByEmail(data.user.email),
  } satisfies AuthenticatedRequestUser;
}