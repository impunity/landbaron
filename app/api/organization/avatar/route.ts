import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can update the organization avatar.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No avatar was uploaded.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File must be under 8MB.' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() || 'png' : 'png';
    const filePath = `organization-avatars/${existing.id}-${Date.now()}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('organization-avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('organization-avatars')
      .getPublicUrl(uploadData.path);

    const avatarUrl = publicUrlData.publicUrl;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, organization: data });
  } catch (error) {
    console.error('POST /api/organization/avatar failed:', error);
    return NextResponse.json({ error: 'Avatar could not be updated.' }, { status: 500 });
  }
}
