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

    if (user.role !== 'owner' && user.role !== 'manager') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('login_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    console.error('GET /api/login-events failed:', error);
    return NextResponse.json({ error: 'Unable to load the usage log right now.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    let name: string | null = null;
    let avatarUrl: string | null = null;

    if (user.role === 'tenant') {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name, avatar_url')
        .ilike('email', user.email)
        .maybeSingle();

      name = tenant?.name ?? null;
      avatarUrl = tenant?.avatar_url ?? null;
    } else {
      const { data: staff } = await supabaseAdmin
        .from('staff_members')
        .select('name, avatar_url')
        .ilike('email', user.email)
        .maybeSingle();

      name = staff?.name ?? null;
      avatarUrl = staff?.avatar_url ?? null;
    }

    const { error } = await supabaseAdmin.from('login_events').insert([
      {
        user_id: user.id,
        email: user.email,
        name,
        avatar_url: avatarUrl,
        role: user.role,
      },
    ]);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/login-events failed:', error);
    return NextResponse.json({ error: 'Login event could not be recorded.' }, { status: 500 });
  }
}
