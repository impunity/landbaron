import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'tenant') return NextResponse.json({ error: 'Tenant access only.' }, { status: 403 });

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, units(property_id, properties(name, address))')
      .ilike('email', user.email)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (tenantError) throw tenantError;

    const unit = Array.isArray(tenant?.units) ? tenant.units[0] : tenant?.units;
    const property = Array.isArray(unit?.properties) ? unit.properties[0] : unit?.properties;
    if (!tenant || !unit?.property_id) {
      return NextResponse.json({ error: 'No active tenant record was found for this account.' }, { status: 404 });
    }

    const { data: neighbors, error: neighborsError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, email, phone, instagram_handle, avatar_url, share_contact_info, units!inner(unit_number, property_id)')
      .eq('units.property_id', unit.property_id)
      .eq('status', 'active');
    if (neighborsError) throw neighborsError;

    const directory = (neighbors ?? [])
      .map((neighbor) => {
        const neighborUnit = Array.isArray(neighbor.units) ? neighbor.units[0] : neighbor.units;
        const isSelf = neighbor.id === tenant.id;
        const shared = neighbor.share_contact_info !== false;
        const visible = shared || isSelf;
        return {
          is_self: isSelf,
          id: neighbor.id,
          name: neighbor.name,
          unit_number: neighborUnit?.unit_number ?? '',
          avatar_url: neighbor.avatar_url ?? null,
          shared,
          email: visible ? neighbor.email ?? null : null,
          phone: visible ? neighbor.phone ?? null : null,
          instagram_handle: visible ? neighbor.instagram_handle ?? null : null,
        };
      })
      .sort((a, b) => Number(b.is_self) - Number(a.is_self) || a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }) || a.name.localeCompare(b.name));

    return NextResponse.json({ property: property ? { id: unit.property_id, ...property } : null, tenants: directory });
  } catch (error) {
    console.error('GET /api/tenant-portal/directory failed:', error);
    return NextResponse.json({ error: 'Tenant directory could not be loaded.' }, { status: 500 });
  }
}
