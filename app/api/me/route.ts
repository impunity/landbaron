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

    const { data: ownedOrganization } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .or(`owner_user_id.eq.${user.id},owner_email.ilike.${user.email}`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: organization } = ownedOrganization ? { data: ownedOrganization } : await supabaseAdmin
      .from('organizations')
      .select('name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      email: user.email,
      role: user.role,
      name,
      avatarUrl,
      organizationName: organization?.name ?? null,
    });
  } catch (error) {
    console.error('GET /api/me failed:', error);
    return NextResponse.json({ error: 'Unable to load profile.' }, { status: 500 });
  }
}
