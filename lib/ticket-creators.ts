import { getUserRoleByEmail } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const formatStaffRole = (role: string) => {
  const normalized = role.trim().toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'Staff';
};

async function resolveCreatorLabel(userId: string) {
  if (!supabaseAdmin) return null;

  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = authData.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const metadataName = String(authData.user?.user_metadata?.full_name ?? authData.user?.user_metadata?.name ?? '').trim();

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('name, role')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (staff) {
    return `${String(staff.name ?? '').trim() || metadataName || email} (${formatStaffRole(String(staff.role ?? ''))})`;
  }

  const { data: organization } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .or(`owner_user_id.eq.${userId},owner_email.ilike.${email}`)
    .limit(1)
    .maybeSingle();
  if (organization || getUserRoleByEmail(email) === 'owner') {
    return `${metadataName || email} (Owner)`;
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (tenant) {
    return `${String(tenant.name ?? '').trim() || metadataName || email} (Tenant)`;
  }

  return metadataName || email;
}

export async function getTicketCreatorLabels(userIds: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    try {
      return [id, await resolveCreatorLabel(id)] as const;
    } catch (error) {
      console.error('Unable to resolve ticket creator:', error instanceof Error ? error.message : error);
      return [id, null] as const;
    }
  }));

  const labels = new Map<string, string>();
  for (const [id, label] of entries) {
    if (label) labels.set(id, label);
  }
  return labels;
}
