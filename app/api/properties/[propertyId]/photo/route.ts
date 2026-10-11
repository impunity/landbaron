import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { isHeicImage, prepareImageUpload } from '@/lib/image-upload';
import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'property-photos';
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // Vercel's serverless request body limit
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIGRATION_MESSAGE = 'Run supabase/property-photos.sql in the Supabase SQL Editor to enable property photos.';

const isMissingSchema = (error: unknown) =>
  /photo_url|bucket/i.test(String((error as { message?: unknown } | null)?.message ?? ''));

async function authorize(request: NextRequest, propertyId: string) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  const user = await getAuthenticatedRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'Only owners and managers can change the property photo.' }, { status: 403 });
  }

  const organizationId = await getRequestOrganizationId(user);
  const { data: property, error } = await supabaseAdmin
    .from('properties')
    .select('id, organization_id')
    .eq('id', propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!property || !organizationId || property.organization_id !== organizationId) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }
  return null;
}

async function getCurrentPhotoUrl(propertyId: string) {
  const { data, error } = await supabaseAdmin!.from('properties').select('photo_url').eq('id', propertyId).maybeSingle();
  if (error) throw error;
  return (data?.photo_url as string | null | undefined) ?? null;
}

async function removeStoredPhoto(propertyId: string, photoUrl: string | null) {
  if (!photoUrl || !supabaseAdmin) return;
  try {
    const url = new URL(photoUrl);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicPrefix = `/storage/v1/object/public/${BUCKET}/`;
    if (!supabaseUrl || url.origin !== new URL(supabaseUrl).origin || !url.pathname.startsWith(`${publicPrefix}${propertyId}/`)) return;
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([decodeURIComponent(url.pathname.slice(publicPrefix.length))]);
    if (error) console.error('Previous property photo could not be removed:', error);
  } catch (cleanupError) {
    console.error('Previous property photo path could not be parsed for cleanup:', cleanupError);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  let uploadedPath: string | null = null;
  try {
    const { propertyId } = await params;
    const denied = await authorize(request, propertyId);
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Property photos must be 4 MB or smaller.' }, { status: 400 });
    if (!ACCEPTED_TYPES.has(file.type) && !isHeicImage(file)) {
      return NextResponse.json({ error: 'Choose a JPG, PNG, WEBP, GIF, or HEIC photo.' }, { status: 400 });
    }

    const previousPhotoUrl = await getCurrentPhotoUrl(propertyId);

    const uploadFile = await prepareImageUpload(file);
    const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${propertyId}/${crypto.randomUUID()}.${extension}`;
    const { data: upload, error: uploadError } = await supabaseAdmin!.storage
      .from(BUCKET)
      .upload(path, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type });
    if (uploadError) throw uploadError;
    uploadedPath = upload.path;

    const { data: publicUrl } = supabaseAdmin!.storage.from(BUCKET).getPublicUrl(upload.path);
    const { error: saveError } = await supabaseAdmin!
      .from('properties')
      .update({ photo_url: publicUrl.publicUrl, updated_at: new Date().toISOString() })
      .eq('id', propertyId);
    if (saveError) throw saveError;

    uploadedPath = null;
    await removeStoredPhoto(propertyId, previousPhotoUrl);
    return NextResponse.json({ photo_url: publicUrl.publicUrl });
  } catch (error) {
    if (uploadedPath && supabaseAdmin) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(BUCKET).remove([uploadedPath]);
      if (cleanupError) console.error('Property photo cleanup failed:', cleanupError);
    }
    if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 503 });
    console.error('POST /api/properties/[propertyId]/photo failed:', error);
    return NextResponse.json({ error: 'Property photo could not be uploaded.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { propertyId } = await params;
    const denied = await authorize(request, propertyId);
    if (denied) return denied;

    const previousPhotoUrl = await getCurrentPhotoUrl(propertyId);
    const { error } = await supabaseAdmin!
      .from('properties')
      .update({ photo_url: null, updated_at: new Date().toISOString() })
      .eq('id', propertyId);
    if (error) throw error;

    await removeStoredPhoto(propertyId, previousPhotoUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 503 });
    console.error('DELETE /api/properties/[propertyId]/photo failed:', error);
    return NextResponse.json({ error: 'Property photo could not be removed.' }, { status: 500 });
  }
}
