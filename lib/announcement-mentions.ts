import { supabaseAdmin } from '@/lib/supabase-admin';

export type MentionCandidate = { id: string; name: string; role: 'Resident' | 'Staff' | 'Contractor' };

export async function getAnnouncementMentionCandidates(propertyId: string, organizationId: string | null) {
  if (!supabaseAdmin) throw new Error('Supabase is not configured.');

  const { data: units, error: unitsError } = await supabaseAdmin
    .from('units').select('id').eq('property_id', propertyId);
  if (unitsError) throw unitsError;
  const unitIds = (units ?? []).map((unit) => unit.id);

  const { data: tenants, error: tenantsError } = unitIds.length
    ? await supabaseAdmin.from('tenants').select('id, name').in('unit_id', unitIds).eq('status', 'active')
    : { data: [], error: null };
  if (tenantsError) throw tenantsError;

  const { data: staff, error: staffError } = organizationId
    ? await supabaseAdmin.from('staff_members').select('id, name, role').eq('organization_id', organizationId)
    : { data: [], error: null };
  if (staffError) throw staffError;

  return [
    ...(tenants ?? []).map((tenant) => ({ id: tenant.id, name: tenant.name, role: 'Resident' as const })),
    ...(staff ?? []).map((member) => ({ id: member.id, name: member.name, role: member.role === 'Contractor' ? 'Contractor' as const : 'Staff' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}