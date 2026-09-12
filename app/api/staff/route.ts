import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

const normalizeRole = (value?: string | null) => {
  const role = (value ?? '').trim();
  if (role === 'Owner' || role === 'owner') return 'Owner';
  if (role === 'Maintenance' || role === 'maintenance') return 'Maintenance';
  if (role === 'Contractor' || role === 'contractor') return 'Contractor';
  return 'Maintenance';
};

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const userRole = request.headers.get('x-user-role')?.trim().toLowerCase();
    if (userRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can view staff.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ staff: data ?? [] });
  } catch (error) {
    console.error('GET /api/staff failed:', error);
    return NextResponse.json(
      { error: 'Unable to load staff members right now.' },
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

    const userRole = request.headers.get('x-user-role')?.trim().toLowerCase();
    if (userRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can manage staff.' }, { status: 403 });
    }

    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const role = normalizeRole(body?.role);

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .upsert(
        {
          name,
          email,
          role,
        },
        { onConflict: 'email' },
      )
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({ staff: data?.[0] ?? null });
  } catch (error) {
    console.error('POST /api/staff failed:', error);
    return NextResponse.json(
      { error: 'Staff could not be saved.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const userRole = request.headers.get('x-user-role')?.trim().toLowerCase();
    if (userRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can manage staff.' }, { status: 403 });
    }

    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('staff_members')
      .delete()
      .eq('email', email);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/staff failed:', error);
    return NextResponse.json(
      { error: 'Staff could not be removed.' },
      { status: 500 },
    );
  }
}
