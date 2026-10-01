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
      .select('*, units(*, unit_photos(*), properties(*, property_staff_assignments(*, staff_members(*))))')
      .ilike('email', user.email)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (tenantError) throw tenantError;
    const unit = Array.isArray(tenant?.units) ? tenant.units[0] : tenant?.units;
    if (!unit) return NextResponse.json({ error: 'No active tenant record was found for this account.' }, { status: 404 });

    const { data: improvements, error: improvementsError } = await supabaseAdmin
      .from('tenant_improvement_photos')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });
    if (improvementsError && !improvementsError.message.toLowerCase().includes('tenant_improvement_photos')) throw improvementsError;

    const property = Array.isArray(unit.properties) ? unit.properties[0] : unit.properties;
    if (!property) return NextResponse.json({ error: 'No property was found for this tenant.' }, { status: 404 });
    const { data: solarIntegration, error: solarIntegrationError } = await supabaseAdmin.from('property_solar_integrations')
      .select('enabled').eq('property_id', property.id).maybeSingle();
    if (solarIntegrationError) throw solarIntegrationError;
    const assignments = property?.property_staff_assignments ?? [];
    const staff = assignments.map((assignment: Record<string, unknown>) => ({
      ...(Array.isArray(assignment.staff_members) ? assignment.staff_members[0] : assignment.staff_members) as Record<string, unknown>,
      assignment_type: assignment.assignment_type,
    }));
    const owners = await supabaseAdmin.from('staff_members').select('*').eq('role', 'Owner').order('name');

    return NextResponse.json({
      tenant,
      unit,
      property: { ...property, solar_enabled: solarIntegration?.enabled ?? false },
      unitPhotos: unit.unit_photos ?? [],
      improvements: improvements ?? [],
      primaryStaff: staff.filter((member: { assignment_type?: string }) => member.assignment_type === 'primary'),
      secondaryStaff: staff.filter((member: { assignment_type?: string }) => member.assignment_type === 'secondary'),
      owners: owners.data ?? [],
    });
  } catch (error) {
    console.error('GET /api/tenant-portal failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Tenant portal could not be loaded.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'tenant') return NextResponse.json({ error: 'Tenant access only.' }, { status: 403 });
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.avatar_url === 'string') {
      updates.avatar_url = body.avatar_url.trim() || null;
    }
    if (typeof body.phone === 'string') {
      const phone = body.phone.trim();
      if (phone.length > 30) return NextResponse.json({ error: 'Phone number is too long.' }, { status: 400 });
      updates.phone = phone || null;
    }
    if (typeof body.instagram_handle === 'string') {
      const handle = body.instagram_handle.trim()
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/+$/, '');
      if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
        return NextResponse.json({ error: 'Instagram handle can only contain letters, numbers, periods, and underscores.' }, { status: 400 });
      }
      updates.instagram_handle = handle || null;
    }
    if (typeof body.share_contact_info === 'boolean') {
      updates.share_contact_info = body.share_contact_info;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes were provided.' }, { status: 400 });
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .ilike('email', user.email)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return NextResponse.json({ error: 'No active tenant record was found for this account.' }, { status: 404 });

    const { data, error } = await supabaseAdmin.from('tenants').update(updates).eq('id', tenant.id).select().maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, tenant: data });
  } catch (error) {
    console.error('PATCH /api/tenant-portal failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Tenant profile could not be updated.' }, { status: 500 });
  }
}
