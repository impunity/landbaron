import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'tenant') return NextResponse.json({ error: 'Tenant access only.' }, { status: 403 });

    const { data: tenant, error: tenantError } = await supabaseAdmin.from('tenants').select('id, unit_id').ilike('email', user.email).eq('status', 'active').limit(1).maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return NextResponse.json({ error: 'No active tenant record was found.' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file');
    const caption = typeof formData.get('caption') === 'string' ? String(formData.get('caption')).trim() : null;
    if (!(file instanceof File)) return NextResponse.json({ error: 'No improvement photo was uploaded.' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Photo must be 10MB or smaller.' }, { status: 400 });

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `tenant-improvements/${tenant.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage.from('tenant-improvements').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabaseAdmin.storage.from('tenant-improvements').getPublicUrl(upload.path);
    const { data: photo, error } = await supabaseAdmin.from('tenant_improvement_photos').insert({ tenant_id: tenant.id, unit_id: tenant.unit_id, photo_url: publicUrl.publicUrl, caption: caption || file.name }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, photo });
  } catch (error) {
    console.error('POST /api/tenant-portal/photos failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Improvement photo upload failed.' }, { status: 500 });
  }
}
