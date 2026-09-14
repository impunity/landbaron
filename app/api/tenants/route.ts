import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string' && error.message) return error.message;
    if ('error' in error && typeof error.error === 'string' && error.error) return error.error;
    if ('details' in error && typeof error.details === 'string' && error.details) return error.details;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*, units(id, unit_number, property_id, properties(id, name, address))')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ tenants: tenants ?? [] });
  } catch (error) {
    console.error('GET /api/tenants failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to load tenants.') },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const unitId = String(body?.unit_id ?? '').trim();
    const name = String(body?.name ?? '').trim();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : null;
    const leaseStart = typeof body?.lease_start === 'string' && body.lease_start.trim() ? body.lease_start.trim() : null;
    const leaseEnd = typeof body?.lease_end === 'string' && body.lease_end.trim() ? body.lease_end.trim() : null;
    const status = typeof body?.status === 'string' ? body.status.trim() : 'active';
    const emergencyContact = typeof body?.emergency_contact === 'string' ? body.emergency_contact.trim() : null;
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

    if (!unitId || !name) {
      return NextResponse.json({ error: 'Unit and tenant name are required.' }, { status: 400 });
    }

    // Get property_id for this unit
    const { data: unitData } = await supabaseAdmin
      .from('units')
      .select('property_id')
      .eq('id', unitId)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .insert([
        {
          unit_id: unitId,
          property_id: unitData?.property_id ?? null,
          name,
          email,
          phone,
          lease_start: leaseStart,
          lease_end: leaseEnd,
          status,
          emergency_contact: emergencyContact,
          notes,
        },
      ])
      .select('*, units(id, unit_number, properties(id, name, address))')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, tenant: data });
  } catch (error) {
    console.error('POST /api/tenants failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Tenant could not be added.') },
      { status: 500 },
    );
  }
}
