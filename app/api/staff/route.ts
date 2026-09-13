import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

const normalizeRole = (value?: string | null) => {
  const role = (value ?? '').trim();
  if (role === 'Owner' || role === 'owner') return 'Owner';
  if (role === 'Maintenance' || role === 'maintenance') return 'Maintenance';
  if (role === 'Contractor' || role === 'contractor') return 'Contractor';
  return 'Maintenance';
};

const getStaffSaveErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('staff_members') && (normalized.includes('does not exist') || normalized.includes('relation'))) {
    return 'The staff_members table is missing in Supabase. Create it using the SQL in supabase/staff-members.sql.';
  }

  if (normalized.includes('row level security') || normalized.includes('permission denied')) {
    return 'Supabase is rejecting the write because the staff_members table is missing permissions or RLS rules.';
  }

  return message || 'Staff could not be saved.';
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
    const avatarUrl = typeof body?.avatar_url === 'string' ? body.avatar_url.trim() : null;

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
          avatar_url: avatarUrl,
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
      { error: getStaffSaveErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const userRole = request.headers.get('x-user-role')?.trim().toLowerCase();
    const userEmail = request.headers.get('x-user-email')?.trim().toLowerCase();
    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const hasNameOrRoleUpdate = typeof body?.name === 'string' || typeof body?.role === 'string';
    const isOwner = userRole === 'owner';
    const isSelf = userEmail && userEmail === email;

    if (!isOwner && !isSelf) {
      return NextResponse.json({ error: 'Only the owner or that staff member can update this staff profile.' }, { status: 403 });
    }

    if (!isOwner && hasNameOrRoleUpdate) {
      return NextResponse.json({ error: 'Only owners can update a staff member name or role.' }, { status: 403 });
    }

    const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const role = typeof body?.role === 'string' ? normalizeRole(body.role) : undefined;
    const avatarUrl = body?.avatar_url === null ? null : typeof body?.avatar_url === 'string' ? body.avatar_url.trim() || null : undefined;

    if (name) updates.name = name;
    if (role) updates.role = role;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'No staff fields were provided to update.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .update(updates)
      .eq('email', email)
      .select();

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    }

    return NextResponse.json({ staff: data[0] ?? null });
  } catch (error) {
    console.error('PATCH /api/staff failed:', error);
    return NextResponse.json(
      { error: 'Staff could not be updated.' },
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
