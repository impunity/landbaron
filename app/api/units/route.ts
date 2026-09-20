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
    const propertyId = String(body?.property_id ?? '').trim();
    const unitNumber = String(body?.unit_number ?? '').trim();
    const rentAmount = (user.role === 'owner' || user.role === 'manager') && body?.rent_amount !== undefined && body?.rent_amount !== null && body?.rent_amount !== ''
      ? Number(body.rent_amount)
      : null;
    const bedrooms = body?.bedrooms !== undefined ? Number(body.bedrooms) : 1;
    const bathrooms = body?.bathrooms !== undefined ? Number(body.bathrooms) : 1;
    const squareFeet = body?.square_feet !== undefined && body?.square_feet !== '' ? Number(body.square_feet) : null;
    const status = typeof body?.status === 'string' ? body.status.trim() : 'occupied';
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

    if (!propertyId || !unitNumber) {
      return NextResponse.json(
        { error: 'Property and unit number are required.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('units')
      .insert([
        {
          property_id: propertyId,
          unit_number: unitNumber,
          rent_amount: rentAmount,
          bedrooms,
          bathrooms,
          square_feet: squareFeet,
          status,
          notes,
        },
      ])
      .select('*, properties(*)')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      unit: {
        ...data,
        rent_amount: user.role === 'owner' || user.role === 'manager' ? data.rent_amount : null,
      },
    });
  } catch (error) {
    console.error('POST /api/units failed:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unit could not be created.') },
      { status: 500 },
    );
  }
}
