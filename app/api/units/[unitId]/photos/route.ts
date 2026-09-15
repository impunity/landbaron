import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const caption = typeof formData.get('caption') === 'string' ? String(formData.get('caption')).trim() : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No photo was uploaded.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Photo must be 10MB or smaller.' }, { status: 400 });
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() || 'jpg' : 'jpg';
    const filePath = `unit-attachments/${unitId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;

    // Upload to unit-photos or ticket-photos bucket
    let bucketName = 'unit-photos';
    let { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      // Fallback to ticket-photos bucket if unit-photos bucket not created yet
      bucketName = 'ticket-photos';
      const fallbackUpload = await supabaseAdmin.storage
        .from(bucketName)
        .upload(`units/${filePath}`, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (fallbackUpload.error) {
        throw uploadError;
      }
      uploadData = fallbackUpload.data;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(uploadData?.path ?? filePath);

    const publicUrl = publicUrlData.publicUrl;

    const { data: photoRecord, error: dbError } = await supabaseAdmin
      .from('unit_photos')
      .insert([
        {
          unit_id: unitId,
          photo_url: publicUrl,
          caption: caption || file.name,
        },
      ])
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    return NextResponse.json({ ok: true, photo: photoRecord });
  } catch (error) {
    console.error('POST /api/units/[unitId]/photos failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Photo upload failed.' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const photoId = String(body?.photoId ?? '').trim();

    if (!photoId) {
      return NextResponse.json({ error: 'Photo ID is required.' }, { status: 400 });
    }

    // Try setting is_primary column if available, plus bump created_at timestamp so it orders first
    const now = new Date().toISOString();
    
    // First reset other photos
    await supabaseAdmin
      .from('unit_photos')
      .update({ is_primary: false })
      .eq('unit_id', unitId)
      .neq('id', photoId);

    const { data, error } = await supabaseAdmin
      .from('unit_photos')
      .update({ is_primary: true, created_at: now })
      .eq('id', photoId)
      .eq('unit_id', unitId)
      .select()
      .single();

    if (error) {
      // If is_primary column is not in DB yet, fallback to updating created_at
      const fallback = await supabaseAdmin
        .from('unit_photos')
        .update({ created_at: now })
        .eq('id', photoId)
        .eq('unit_id', unitId)
        .select()
        .single();

      if (fallback.error) {
        throw fallback.error;
      }

      return NextResponse.json({ ok: true, photo: fallback.data });
    }

    return NextResponse.json({ ok: true, photo: data });
  } catch (error) {
    console.error('PATCH /api/units/[unitId]/photos failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not set primary photo.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const photoId = new URL(request.url).searchParams.get('photoId');
    if (!photoId) {
      return NextResponse.json({ error: 'Photo ID is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('unit_photos')
      .delete()
      .eq('id', photoId)
      .eq('unit_id', unitId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/units/[unitId]/photos failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Photo deletion failed.' },
      { status: 500 },
    );
  }
}
