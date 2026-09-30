import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    if (user.role === 'tenant') {
      const { data: tenants, error: tenantError } = await supabaseAdmin
        .from('tenants')
        .select('units(properties(id, name, address))')
        .ilike('email', user.email)
        .eq('status', 'active');
      if (tenantError) throw tenantError;

      const properties = new Map<string, { id: string; name: string; address: string }>();
      for (const tenant of tenants ?? []) {
        const unit = Array.isArray(tenant.units) ? tenant.units[0] : tenant.units;
        const property = Array.isArray(unit?.properties) ? unit.properties[0] : unit?.properties;
        if (property) properties.set(property.id, property);
      }
      return NextResponse.json({ properties: [...properties.values()].sort((a, b) => a.name.localeCompare(b.name)) });
    }

    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ properties: [] });
    const { data: properties, error } = await supabaseAdmin
      .from('properties')
      .select('id, name, address')
      .eq('organization_id', organizationId)
      .order('name');
    if (error) throw error;
    return NextResponse.json({ properties: properties ?? [] });
  } catch (error) {
    console.error('GET announcement properties failed:', error);
    return NextResponse.json({ error: 'Properties could not be loaded.' }, { status: 500 });
  }
}