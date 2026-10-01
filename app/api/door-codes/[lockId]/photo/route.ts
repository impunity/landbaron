import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { isImageUpload, prepareImageUpload } from '@/lib/image-upload';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lockId: string }> },
) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!['owner', 'manager', 'maintenance'].includes(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

    const { lockId } = await params;
    const { data: lock, error: lockError } = await supabaseAdmin.from('property_door_locks')
      .select('id, property_id').eq('id', lockId).maybeSingle();
    if (lockError) throw lockError;
    if (!lock) return NextResponse.json({ error: 'Lock not found.' }, { status: 404 });

    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ error: 'Lock not found.' }, { status: 404 });
    const { data: property, error: propertyError } = await supabaseAdmin.from('properties')
      .select('id').eq('id', lock.property_id).eq('organization_id', organizationId).maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return NextResponse.json({ error: 'Lock not found.' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || !isImageUpload(file)) {
      return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Photo must be 10MB or smaller.' }, { status: 400 });

    const uploadFile = await prepareImageUpload(file);
    const extension = uploadFile.name.includes('.') ? uploadFile.name.split('.').pop() || 'jpg' : 'jpg';
    const filePath = `door-locks/${lockId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
    let bucketName = 'unit-photos';
    const initialUpload = await supabaseAdmin.storage.from(bucketName)
      .upload(filePath, uploadFile, { cacheControl: '3600', upsert: false });
    let uploadData = initialUpload.data;

    if (initialUpload.error) {
      bucketName = 'ticket-photos';
      const fallbackUpload = await supabaseAdmin.storage.from(bucketName)
        .upload(filePath, uploadFile, { cacheControl: '3600', upsert: false });
      if (fallbackUpload.error) throw initialUpload.error;
      uploadData = fallbackUpload.data;
    }

    if (!uploadData) throw new Error('Photo upload returned no file.');
    const { data: publicUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(uploadData.path);
    const { error: updateError } = await supabaseAdmin.from('property_door_locks')
      .update({ photo_url: publicUrlData.publicUrl }).eq('id', lockId).eq('property_id', property.id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, photoUrl: publicUrlData.publicUrl });
  } catch (error) {
    console.error('POST /api/door-codes/[lockId]/photo failed:', error);
    return NextResponse.json({ error: 'Photo could not be uploaded.' }, { status: 500 });
  }
}