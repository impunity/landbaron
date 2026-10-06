import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner') return NextResponse.json({ error: 'Only the organization owner can generate invite codes.' }, { status: 403 });

    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();
      const { data, error } = await supabaseAdmin.from('organizations').update({ invite_code: inviteCode, updated_at: new Date().toISOString() })
        .eq('id', organizationId).select('invite_code').maybeSingle();
      if (error?.code === '23505') continue;
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
      return NextResponse.json({ inviteCode: data.invite_code });
    }

    return NextResponse.json({ error: 'A unique invite code could not be generated. Try again.' }, { status: 503 });
  } catch (error) {
    console.error('POST /api/organization/invite-code failed:', error);
    return NextResponse.json({ error: 'Invite code could not be generated.' }, { status: 500 });
  }
}
