import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

    const { data: properties, error: propError } = await supabaseAdmin
      .from('properties')
      .select('*, units(id, unit_number, rent_amount, tenants(id, name, email, phone))')
      .order('name', { ascending: true });

    if (propError) {
      throw propError;
    }

    // Mask rent_amount for non-owner staff
    const sanitizedProperties = (properties ?? []).map((prop) => {
      const units = Array.isArray(prop.units)
        ? prop.units.map((unit: Record<string, unknown>) => ({
            ...unit,
            rent_amount: user.role === 'owner' ? unit.rent_amount : null,
          }))
        : [];

      return {
        ...prop,
        units,
      };
    });

    return NextResponse.json({ properties: sanitizedProperties });
  } catch (error) {
    console.error('GET /api/properties failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load properties.' },
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
    const name = String(body?.name ?? '').trim();
    const address = String(body?.address ?? '').trim();
    const city = typeof body?.city === 'string' ? body.city.trim() : null;
    const state = typeof body?.state === 'string' ? body.state.trim() : null;
    const postal_code = typeof body?.postal_code === 'string' ? body.postal_code.trim() : null;
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

    if (!name || !address) {
      return NextResponse.json({ error: 'Property name and address are required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('properties')
      .insert([
        {
          name,
          address,
          city,
          state,
          postal_code,
          notes,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, property: data });
  } catch (error) {
    console.error('POST /api/properties failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Property could not be created.' },
      { status: 500 },
    );
  }
}
