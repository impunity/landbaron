import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const normalizeRole = (value?: string | null) => {
  const role = (value ?? '').trim();
  if (role === 'Owner' || role === 'owner') return 'Owner';
  if (role === 'Maintenance' || role === 'maintenance') return 'Maintenance';
  if (role === 'Contractor' || role === 'contractor') return 'Contractor';
  return 'Maintenance';
};

const checkIsOwner = async (role?: string | null, email?: string | null) => {
  if (role === 'owner') return true;
  if (!email || !supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin
      .from('staff_members')
      .select('role')
      .ilike('email', email.trim().toLowerCase())
      .maybeSingle();
    return data?.role?.toLowerCase() === 'owner';
  } catch {
    return false;
  }
};

const buildGenericStaffAvatar = (name: string, role: string) => {
  const initials = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'ST';

  const palette: Record<string, string> = {
    Owner: '#111827',
    Maintenance: '#0f766e',
    Contractor: '#7c3aed',
  };

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${initials} avatar">
      <rect width="120" height="120" rx="60" fill="${palette[role] ?? '#334155'}" />
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial, sans-serif" font-size="36" font-weight="700">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

    const authUser = await getAuthenticatedRequestUser(request);
    const userRole = authUser?.role ?? request.headers.get('x-user-role')?.trim().toLowerCase();
    const userEmail = authUser?.email ?? request.headers.get('x-user-email')?.trim().toLowerCase();
    const isOwner = await checkIsOwner(userRole, userEmail);

    if (!isOwner) {
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

    const authUser = await getAuthenticatedRequestUser(request);
    const userRole = authUser?.role ?? request.headers.get('x-user-role')?.trim().toLowerCase();
    const userEmail = authUser?.email ?? request.headers.get('x-user-email')?.trim().toLowerCase();
    const isOwner = await checkIsOwner(userRole, userEmail);

    if (!isOwner) {
      return NextResponse.json({ error: 'Only owners can manage staff.' }, { status: 403 });
    }

    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const phoneNumber = typeof body?.phone_number === 'string' ? body.phone_number.trim() : '';
    const role = normalizeRole(body?.role);
    const avatarUrl = typeof body?.avatar_url === 'string' && body.avatar_url.trim()
      ? body.avatar_url.trim()
      : buildGenericStaffAvatar(name, role);

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
          phone_number: phoneNumber || null,
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

    const authUser = await getAuthenticatedRequestUser(request);
    const userRole = authUser?.role ?? request.headers.get('x-user-role')?.trim().toLowerCase();
    const userEmail = authUser?.email ?? request.headers.get('x-user-email')?.trim().toLowerCase();
    const body = await request.json();
    const currentEmail = String(body?.current_email ?? body?.email ?? '').trim().toLowerCase();
    const nextEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    const email = currentEmail || nextEmail;

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const hasNameOrRoleUpdate = typeof body?.name === 'string' || typeof body?.role === 'string';
    const isOwner = await checkIsOwner(userRole, userEmail);
    const isSelf = userEmail && userEmail.toLowerCase() === currentEmail.toLowerCase();

    if (!isOwner && !isSelf) {
      return NextResponse.json({ error: 'Only the owner or that staff member can update this staff profile.' }, { status: 403 });
    }

    if (!isOwner && hasNameOrRoleUpdate) {
      return NextResponse.json({ error: 'Only owners can update a staff member name or role.' }, { status: 403 });
    }

    const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const role = typeof body?.role === 'string' ? normalizeRole(body.role) : undefined;
    const phoneNumber = typeof body?.phone_number === 'string' ? body.phone_number.trim() : undefined;
    const avatarUrl = body?.avatar_url === null ? null : typeof body?.avatar_url === 'string' ? body.avatar_url.trim() || null : undefined;

    if (name) updates.name = name;
    if (role) updates.role = role;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber || null;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
    if (nextEmail && nextEmail !== currentEmail) updates.email = nextEmail;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'No staff fields were provided to update.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .update(updates)
      .ilike('email', currentEmail)
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
      { error: error instanceof Error ? error.message : 'Staff could not be updated.' },
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

    const authUser = await getAuthenticatedRequestUser(request);
    const userRole = authUser?.role ?? request.headers.get('x-user-role')?.trim().toLowerCase();
    const userEmail = authUser?.email ?? request.headers.get('x-user-email')?.trim().toLowerCase();
    const isOwner = await checkIsOwner(userRole, userEmail);

    if (!isOwner) {
      return NextResponse.json({ error: 'Only owners can manage staff.' }, { status: 403 });
    }

    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('staff_members')
      .delete()
      .ilike('email', email);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/staff failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Staff could not be removed.' },
      { status: 500 },
    );
  }
}
