import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlatformResourceKey, PLATFORM_PAGE_SIZE, PLATFORM_RESOURCES } from '@/lib/platform-admin';

const ORGANIZATION_FIELDS = 'id,name,owner_email,address,city,state,postal_code,contact_email,contact_phone,tax_id,website_url,avatar_url,created_at,updated_at';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!user.isPlatformAdmin) return NextResponse.json({ error: 'Platform Admin access is required.' }, { status: 403 });

    const { organizationId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return NextResponse.json({ error: 'A valid organization ID is required.' }, { status: 400 });
    }
    const resource = request.nextUrl.searchParams.get('resource') ?? 'properties';
    const pageValue = request.nextUrl.searchParams.get('page') ?? '0';
    const page = Number(pageValue);
    if (!isPlatformResourceKey(resource) || !/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 0 || page > 1_000_000) {
      return NextResponse.json({ error: 'Invalid resource or page.' }, { status: 400 });
    }

    const { data: organization, error: organizationError } = await supabaseAdmin.from('organizations')
      .select(ORGANIZATION_FIELDS).eq('id', organizationId).maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });

    const definition = PLATFORM_RESOURCES[resource];
    let query = supabaseAdmin.from(definition.table)
      .select(definition.select, { count: 'exact' })
      .eq(definition.organizationFilter, organizationId);
    for (const column of definition.order.split(',')) query = query.order(column);
    const { data, error, count } = await query.range(page * PLATFORM_PAGE_SIZE, (page + 1) * PLATFORM_PAGE_SIZE - 1);
    if (error) {
      console.error(`Platform Admin ${resource} query failed:`, error);
      return NextResponse.json({ error: `${definition.label} could not be loaded. Confirm its Supabase migration has been applied.` }, { status: 500 });
    }
    if (!data || count === null) throw new Error('Organization resource query returned incomplete data.');

    const records = data.map((row: unknown) => {
      if (!isRecord(row)) throw new Error('Organization resource query returned an invalid record.');
      return row;
    });
    if (resource === 'disclosures') {
      for (const record of records) {
        if (typeof record.storage_path !== 'string') throw new Error('Legal disclosure has no storage path.');
        const { data: signed, error: signError } = await supabaseAdmin.storage.from('legal-disclosures')
          .createSignedUrl(record.storage_path, 300);
        if (signError) throw signError;
        record.file_url = signed.signedUrl;
      }
    }

    return NextResponse.json({ organization, records, total: count, page, pageSize: PLATFORM_PAGE_SIZE },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('GET /api/platform-admin/organizations/[organizationId] failed:', error);
    return NextResponse.json({ error: 'Unable to load organization data.' }, { status: 500 });
  }
}
