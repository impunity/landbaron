import { NextRequest, NextResponse } from 'next/server';

import { isImageUpload, prepareImageUpload } from '@/lib/image-upload';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'user-avatars';
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an avatar image.' }, { status: 400 });
    if (!isImageUpload(file)) return NextResponse.json({ error: 'Choose a JPG, PNG, WEBP, GIF, or HEIC image.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Avatar images must be 8 MB or smaller.' }, { status: 400 });

    const uploadFile = await prepareImageUpload(file);
    const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { data: uploaded, error: uploadError } = await supabaseAdmin.storage.from(BUCKET)
      .upload(storagePath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type });
    if (uploadError) {
      if (uploadError.message.toLowerCase().includes('bucket')) return NextResponse.json({ error: 'Run supabase/user-preferences.sql to create the avatar storage bucket.' }, { status: 503 });
      throw uploadError;
    }
    const { data: publicUrl } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(uploaded.path);

    const { data: updated, error: updateError } = await supabaseAdmin.from('user_preferences')
      .update({ avatar_url: publicUrl.publicUrl }).eq('user_id', user.id).select('avatar_url').maybeSingle();
    if (updateError) {
      await supabaseAdmin.storage.from(BUCKET).remove([uploaded.path]);
      if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(updateError.code ?? '')) return NextResponse.json({ error: 'Run supabase/user-preferences.sql to enable profile photos.' }, { status: 503 });
      throw updateError;
    }
    if (updated) return NextResponse.json({ ok: true, avatarUrl: updated.avatar_url });

    const { data: inserted, error: insertError } = await supabaseAdmin.from('user_preferences')
      .insert({ user_id: user.id, avatar_url: publicUrl.publicUrl }).select('avatar_url').single();
    if (insertError) {
      await supabaseAdmin.storage.from(BUCKET).remove([uploaded.path]);
      if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(insertError.code ?? '')) return NextResponse.json({ error: 'Run supabase/user-preferences.sql to enable profile photos.' }, { status: 503 });
      throw insertError;
    }
    return NextResponse.json({ ok: true, avatarUrl: inserted.avatar_url });
  } catch (error) {
    console.error('POST /api/me/avatar failed:', error);
    return NextResponse.json({ error: 'Avatar could not be uploaded.' }, { status: 500 });
  }
}