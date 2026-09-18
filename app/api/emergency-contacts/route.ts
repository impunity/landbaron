import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const { data: tenant } = await supabaseAdmin.from('tenants').select('units(property_id, properties(name, address, property_staff_assignments(assignment_type, staff_members(*))))').ilike('email', user.email).eq('status', 'active').limit(1).maybeSingle();
    const unit = Array.isArray(tenant?.units) ? tenant.units[0] : tenant?.units;
    const property = Array.isArray(unit?.properties) ? unit.properties[0] : unit?.properties;
    if (!property) return NextResponse.json({ error: 'No active property was found.' }, { status: 404 });
    const assignments = property.property_staff_assignments ?? [];
    const staff = assignments.map((assignment: Record<string, unknown>) => ({
      ...(Array.isArray(assignment.staff_members) ? assignment.staff_members[0] : assignment.staff_members) as Record<string, unknown>,
      assignment_type: assignment.assignment_type,
    }));
    const { data: owners } = await supabaseAdmin.from('staff_members').select('*').eq('role', 'Owner').order('name');
    return NextResponse.json({ property: { name: property.name, address: property.address }, staff, owners: owners ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Emergency contacts could not be loaded.' }, { status: 500 });
  }
}
