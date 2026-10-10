import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { summarizeOrganizations } from '@/lib/platform-admin';

// Explicit ranges avoid Supabase's default 1,000-row cap skewing platform totals.
async function readAll<T>(fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await fetchPage(start, start + 499);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Platform summary query returned no data.');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!user.isPlatformAdmin) return NextResponse.json({ error: 'Platform Admin access is required.' }, { status: 403 });

    const client = supabaseAdmin;
    const [organizations, staff, tenants, properties, units, logins] = await Promise.all([
      readAll((start, end) => client.from('organizations')
        .select('id,name,owner_email,contact_email,contact_phone,created_at').order('id').range(start, end)),
      readAll((start, end) => client.from('staff_members')
        .select('organization_id,name,email,phone_number,role').order('id').range(start, end)),
      readAll((start, end) => client.from('tenants').select('organization_id').order('id').range(start, end)),
      readAll((start, end) => client.from('properties').select('organization_id').order('id').range(start, end)),
      readAll((start, end) => client.from('units').select('organization_id').order('id').range(start, end)),
      readAll((start, end) => client.from('login_events').select('organization_id,created_at').order('id').range(start, end)),
    ]);

    return NextResponse.json({ organizations: summarizeOrganizations(organizations, staff, tenants, properties, units, logins) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('GET /api/platform-admin failed:', error);
    return NextResponse.json({ error: 'Unable to load Platform Admin statistics. Confirm the organizations and login-events migrations have been applied.' }, { status: 500 });
  }
}
