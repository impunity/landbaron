import { NextRequest, NextResponse } from 'next/server';

import { getUserRoleByEmail } from '@/lib/auth';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const adminEmail = 'scrosby@gmail.com';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const normalizedEmail = user.email.toLowerCase();
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('role, organization_id')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    const { data: ownerOrganization } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .or(`owner_email.ilike.${normalizedEmail},contact_email.ilike.${normalizedEmail}`)
      .limit(1)
      .maybeSingle();

    const configuredRole = getUserRoleByEmail(normalizedEmail);
    const recognized = Boolean(tenant || staff || ownerOrganization || configuredRole !== 'tenant' || normalizedEmail === adminEmail);

    return NextResponse.json({
      recognized,
      isAdmin: normalizedEmail === adminEmail,
      role: staff?.role ? String(staff.role).toLowerCase() : ownerOrganization || configuredRole !== 'tenant' ? 'owner' : tenant ? 'tenant' : null,
      organizationId: staff?.organization_id ?? ownerOrganization?.id ?? null,
    });
  } catch (error) {
    console.error('GET /api/account-status failed:', error);
    return NextResponse.json({ error: 'Unable to determine account status.' }, { status: 500 });
  }
}
