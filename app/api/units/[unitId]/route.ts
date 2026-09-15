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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

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

    const { data: unit, error: unitError } = await supabaseAdmin
      .from('units')
      .select('*, properties(*), tenants(*), unit_photos(*), unit_maintenance_notes(*)')
      .eq('id', unitId)
      .maybeSingle();

    if (unitError) {
      throw unitError;
    }

    if (!unit) {
      return NextResponse.json({ error: 'Unit not found.' }, { status: 404 });
    }

    // Sort maintenance notes newest first
    const notes = Array.isArray(unit.unit_maintenance_notes)
      ? [...unit.unit_maintenance_notes].sort((a, b) => {
          const dateA = new Date(a.performed_at || a.created_at).getTime();
          const dateB = new Date(b.performed_at || b.created_at).getTime();
          return dateB - dateA;
        })
      : [];

    // Sort photos: primary photo first, then newest first
    const photos = Array.isArray(unit.unit_photos)
      ? [...unit.unit_photos].sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
      : [];

    // Fetch related tickets for this unit/property
    let relatedTicketsQuery = supabaseAdmin
      .from('tickets')
      .select('*')
      .or(`unit_id.eq.${unitId},property_id.eq.${unit.property_id}`);

    const { data: ticketsData } = await relatedTicketsQuery;

    // Filter tickets to match this unit either directly by unit_id or matching address/unit in description
    const propertyAddress = String(unit.properties?.address ?? '').toLowerCase().trim();
    const unitNumber = String(unit.unit_number ?? '').toLowerCase().trim();

    const { data: allTickets } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    const matchedTicketsMap = new Map<string, Record<string, unknown>>();

    (ticketsData ?? []).forEach((t) => matchedTicketsMap.set(t.id, t));

    (allTickets ?? []).forEach((t) => {
      if (t.unit_id === unitId) {
        matchedTicketsMap.set(t.id, t);
      } else if (propertyAddress) {
        const desc = String(t.description ?? '').toLowerCase();
        const title = String(t.title ?? '').toLowerCase();
        if (
          (desc.includes(propertyAddress) || title.includes(propertyAddress)) &&
          (!unitNumber || desc.includes(unitNumber) || title.includes(unitNumber))
        ) {
          matchedTicketsMap.set(t.id, t);
        }
      }
    });

    const relatedTickets = Array.from(matchedTicketsMap.values()).sort(
      (a, b) => new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime(),
    );

    return NextResponse.json({
      unit: {
        ...unit,
        rent_amount: user.role === 'owner' ? unit.rent_amount : null,
        unit_photos: photos,
        unit_maintenance_notes: notes,
      },
      tickets: relatedTickets,
    });
  } catch (error) {
    console.error('GET /api/units/[unitId] failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to load unit details.') },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

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

    if (typeof body.unit_number === 'string') updates.unit_number = body.unit_number.trim();
    if (body.bedrooms !== undefined) updates.bedrooms = Number(body.bedrooms);
    if (body.bathrooms !== undefined) updates.bathrooms = Number(body.bathrooms);
    if (body.square_feet !== undefined) updates.square_feet = body.square_feet !== '' && body.square_feet !== null ? Number(body.square_feet) : null;
    if (typeof body.status === 'string') updates.status = body.status.trim();
    if (body.notes !== undefined) updates.notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    // Rent can only be updated by the owner
    if (user.role === 'owner' && body.rent_amount !== undefined) {
      updates.rent_amount = body.rent_amount !== '' && body.rent_amount !== null ? Number(body.rent_amount) : null;
    }

    const { data, error } = await supabaseAdmin
      .from('units')
      .update(updates)
      .eq('id', unitId)
      .select('*, properties(*)')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      unit: {
        ...data,
        rent_amount: user.role === 'owner' ? data.rent_amount : null,
      },
    });
  } catch (error) {
    console.error('PATCH /api/units/[unitId] failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unit update failed.') },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

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

    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Only owners can delete units.' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('units')
      .delete()
      .eq('id', unitId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/units/[unitId] failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unit deletion failed.') },
      { status: 500 },
    );
  }
}
