import { isTicketInRequestOrganization } from '@/lib/organization-context';
import type { AuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function canAccessTicket(user: AuthenticatedRequestUser, ticketId: string) {
  if (!supabaseAdmin || !(await isTicketInRequestOrganization(user, ticketId))) return false;
  if (user.role !== 'tenant') return true;
  const { data, error } = await supabaseAdmin.from('tickets')
    .select('created_by').eq('id', ticketId).maybeSingle();
  if (error) throw error;
  return data?.created_by === user.id;
}
