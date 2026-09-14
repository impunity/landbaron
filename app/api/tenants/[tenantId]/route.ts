import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;

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

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*, units(id, unit_number, property_id, properties(id, name, address))')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
    }

    return NextResponse.json({ tenant });
  } catch (error) {
    console.error('GET /api/tenants/[tenantId] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load tenant.' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;

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
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (body.email !== undefined) updates.email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
    if (body.phone !== undefined) updates.phone = typeof body.phone === 'string' ? body.phone.trim() : null;
    if (body.lease_start !== undefined) updates.lease_start = typeof body.lease_start === 'string' && body.lease_start.trim() ? body.lease_start.trim() : null;
    if (body.lease_end !== undefined) updates.lease_end = typeof body.lease_end === 'string' && body.lease_end.trim() ? body.lease_end.trim() : null;
    if (typeof body.status === 'string') updates.status = body.status.trim();
    if (body.emergency_contact !== undefined) updates.emergency_contact = typeof body.emergency_contact === 'string' ? body.emergency_contact.trim() : null;
    if (body.notes !== undefined) updates.notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select('*, units(id, unit_number, properties(id, name, address))')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, tenant: data });
  } catch (error) {
    console.error('PATCH /api/tenants/[tenantId] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tenant update failed.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;

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

    const { error } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenantId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/tenants/[tenantId] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tenant deletion failed.' },
      { status: 500 },
    );
  }
}
