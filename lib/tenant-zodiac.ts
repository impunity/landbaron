import { getZodiacSign } from '@/lib/profile-insights';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function withTenantZodiacSigns<T extends { id: string }>(tenants: T[]) {
  if (!supabaseAdmin) throw new Error('Supabase is not configured.');
  const signs = new Map<string, string | null>();
  for (let start = 0; start < tenants.length; start += 100) {
    const { data, error } = await supabaseAdmin.rpc('get_tenant_birthdates', {
      tenant_ids: tenants.slice(start, start + 100).map((tenant) => tenant.id),
    });
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ tenant_id: string; birthdate: string }>) {
      signs.set(row.tenant_id, getZodiacSign(row.birthdate));
    }
  }
  return tenants.map((tenant) => ({ ...tenant, zodiac_sign: signs.get(tenant.id) ?? null }));
}
