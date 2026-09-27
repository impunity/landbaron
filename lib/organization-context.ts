import type { AuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Resolves which organization a request belongs to. Order matters: explicit staff and
// ownership links win, and the single-organization fallback only applies before any
// second organization exists so legacy data stays reachable.
export async function getRequestOrganizationId(user: AuthenticatedRequestUser): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('organization_id')
    .ilike('email', user.email)
    .not('organization_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (staff?.organization_id) return staff.organization_id as string;

  const { data: owned } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .or(`owner_user_id.eq.${user.id},owner_email.ilike.${user.email}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned?.id) return owned.id as string;

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('property_id, properties(organization_id)')
    .ilike('email', user.email)
    .limit(1)
    .maybeSingle();

  const tenantProperty = tenant?.properties as { organization_id?: string } | { organization_id?: string }[] | null;
  const tenantOrganizationId = Array.isArray(tenantProperty)
    ? tenantProperty[0]?.organization_id
    : tenantProperty?.organization_id;

  if (tenantOrganizationId) return tenantOrganizationId;

  const { data: organizations } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(2);

  return organizations?.length === 1 ? (organizations[0].id as string) : null;
}

// Property ids scope tables that may predate their own organization_id column.
export async function getOrganizationPropertyIds(organizationId: string | null): Promise<string[]> {
  if (!supabaseAdmin || !organizationId) return [];

  const { data } = await supabaseAdmin
    .from('properties')
    .select('id')
    .eq('organization_id', organizationId);

  return (data ?? []).map((property) => property.id as string);
}
