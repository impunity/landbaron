import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { data: organization, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({ organization: organization ?? null });
  } catch (error) {
    console.error('GET /api/organization failed:', error);
    return NextResponse.json({ error: 'Unable to load organization details.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can edit organization details.' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const stringFields = [
      'name',
      'address',
      'city',
      'state',
      'postal_code',
      'contact_email',
      'contact_phone',
      'tax_id',
      'website_url',
    ] as const;

    for (const field of stringFields) {
      if (typeof body[field] === 'string') {
        updates[field] = body[field].trim() || null;
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, organization: data });
  } catch (error) {
    console.error('PATCH /api/organization failed:', error);
    return NextResponse.json({ error: 'Organization could not be updated.' }, { status: 500 });
  }
}
