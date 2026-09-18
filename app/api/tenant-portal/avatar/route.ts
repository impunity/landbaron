import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'tenant') return NextResponse.json({ error: 'Tenant access only.' }, { status: 403 });
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No avatar was uploaded.' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Avatar must be 8MB or smaller.' }, { status: 400 });

    const path = `tenant-avatars/${user.id}-${Date.now()}.${file.name.split('.').pop()?.toLowerCase() || 'jpg'}`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage.from('tenant-improvements').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabaseAdmin.storage.from('tenant-improvements').getPublicUrl(upload.path);
    const { data: tenant, error } = await supabaseAdmin.from('tenants').update({ avatar_url: publicUrl.publicUrl }).ilike('email', user.email).select().limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, tenant });
  } catch (error) {
    console.error('POST /api/tenant-portal/avatar failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Avatar upload failed.' }, { status: 500 });
  }
}
