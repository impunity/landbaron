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
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await params;

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

    const { data: property, error: propError } = await supabaseAdmin
      .from('properties')
      .select('*, units(*, tenants(*), unit_photos(*), unit_maintenance_notes(*))')
      .eq('id', propertyId)
      .maybeSingle();

    if (propError) {
      throw propError;
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }

    // Sanitize rent_amount for non-owners
    const units = Array.isArray(property.units)
      ? property.units.map((unit: Record<string, unknown>) => ({
          ...unit,
          rent_amount: user.role === 'owner' ? unit.rent_amount : null,
          unit_photos: Array.isArray(unit.unit_photos)
            ? [...unit.unit_photos].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            : [],
        }))
      : [];

    return NextResponse.json({
      property: {
        ...property,
        units,
      },
    });
  } catch (error) {
    console.error('GET /api/properties/[propertyId] failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to load property details.') },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await params;

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
    if (typeof body.address === 'string') updates.address = body.address.trim();
    if (body.city !== undefined) updates.city = typeof body.city === 'string' ? body.city.trim() : null;
    if (body.state !== undefined) updates.state = typeof body.state === 'string' ? body.state.trim() : null;
    if (body.postal_code !== undefined) updates.postal_code = typeof body.postal_code === 'string' ? body.postal_code.trim() : null;
    if (body.notes !== undefined) updates.notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    const { data, error } = await supabaseAdmin
      .from('properties')
      .update(updates)
      .eq('id', propertyId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, property: data });
  } catch (error) {
    console.error('PATCH /api/properties/[propertyId] failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Property update failed.') },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await params;

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
      return NextResponse.json({ error: 'Only owners can delete properties.' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('properties')
      .delete()
      .eq('id', propertyId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/properties/[propertyId] failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Property deletion failed.') },
      { status: 500 },
    );
  }
}
