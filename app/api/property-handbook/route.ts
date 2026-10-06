import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { isHeicImage, prepareImageUpload } from '@/lib/image-upload';
import { googleDocPreview } from '@/lib/property-handbook';
import { getAuthenticatedRequestUser, type AuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function accessibleProperties(user: AuthenticatedRequestUser) {
  const organizationId = await getRequestOrganizationId(user);
  if (!organizationId || !supabaseAdmin) return [];
  let query = supabaseAdmin.from('properties').select('id, name, address, city, state, postal_code, latitude, longitude').eq('organization_id', organizationId).order('name');
  if (user.role === 'tenant') {
    const { data: tenant, error } = await supabaseAdmin.from('tenants').select('property_id, unit_id').ilike('email', user.email).eq('status', 'active').limit(1).maybeSingle();
    if (error) throw error;
    let propertyId = tenant?.property_id;
    if (tenant?.unit_id) {
      const { data: unit, error: unitError } = await supabaseAdmin.from('units').select('property_id').eq('id', tenant.unit_id).maybeSingle();
      if (unitError) throw unitError;
      propertyId = unit?.property_id;
    }
    if (!propertyId) return [];
    query = query.eq('id', propertyId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const properties = await accessibleProperties(user);
    const requestedId = request.nextUrl.searchParams.get('propertyId');
    const property = requestedId ? properties.find((entry) => entry.id === requestedId) : properties[0];
    if (requestedId && !property) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const canEdit = user.role !== 'tenant';
    if (!property) return NextResponse.json({ properties, property: null, canEdit });
    const [units, handbook] = await Promise.all([
      supabaseAdmin.from('units').select('id', { count: 'exact', head: true }).eq('property_id', property.id),
      supabaseAdmin.from('property_handbooks').select('body, google_doc_url, photo_url, updated_at').eq('property_id', property.id).maybeSingle(),
    ]);
    if (units.error) throw units.error;
    if (handbook.error) {
      if (['PGRST205', '42P01', '42703'].includes(handbook.error.code ?? '')) return NextResponse.json({ error: 'Apply supabase/property-handbooks.sql in Supabase to enable the handbook.' }, { status: 503 });
      throw handbook.error;
    }
    return NextResponse.json({ properties, property, canEdit, unitCount: units.count ?? 0, handbook: handbook.data ?? { body: '', google_doc_url: null, photo_url: null, updated_at: null } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET property handbook failed:', error);
    return NextResponse.json({ error: 'Property handbook could not be loaded.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role === 'tenant') return NextResponse.json({ error: 'Tenants have read-only access.' }, { status: 403 });
    const input = await request.json();
    if (typeof input.propertyId !== 'string' || typeof input.body !== 'string' || input.body.length > 100000 || typeof input.googleDocUrl !== 'string' || input.googleDocUrl.length > 2048) {
      return NextResponse.json({ error: 'Enter a valid handbook (100,000 characters maximum) and optional Google Docs URL.' }, { status: 400 });
    }
    const docUrl = googleDocPreview(input.googleDocUrl);
    if (input.googleDocUrl.trim() && !docUrl) return NextResponse.json({ error: 'Enter an HTTPS Google Docs document link.' }, { status: 400 });
    const properties = await accessibleProperties(user);
    if (!properties.some((property) => property.id === input.propertyId)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const { data: existingHandbook, error: existingError } = await supabaseAdmin.from('property_handbooks')
      .select('photo_url')
      .eq('property_id', input.propertyId)
      .maybeSingle();
    if (existingError) {
      if (['PGRST205', '42P01', '42703'].includes(existingError.code ?? '')) return NextResponse.json({ error: 'Apply supabase/property-handbooks.sql in Supabase to enable the handbook.' }, { status: 503 });
      throw existingError;
    }
    const { data, error } = await supabaseAdmin.from('property_handbooks').upsert({ property_id: input.propertyId, body: input.body, google_doc_url: docUrl, photo_url: existingHandbook?.photo_url ?? null, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'property_id' }).select('body, google_doc_url, photo_url, updated_at').single();
    if (error) {
      if (['PGRST205', '42P01', '42703'].includes(error.code ?? '')) return NextResponse.json({ error: 'Apply supabase/property-handbooks.sql in Supabase to enable the handbook.' }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ handbook: data });
  } catch (error) {
    console.error('PUT property handbook failed:', error);
    return NextResponse.json({ error: 'Property handbook could not be saved.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'manager') return NextResponse.json({ error: 'Only owners and managers can upload a property photo.' }, { status: 403 });

    const formData = await request.formData();
    const propertyId = formData.get('propertyId');
    const file = formData.get('file');
    if (typeof propertyId !== 'string' || !propertyId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Property and photo are required.' }, { status: 400 });
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Property photos must be 20 MB or smaller.' }, { status: 400 });
    }
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!acceptedTypes.has(file.type) && !isHeicImage(file)) {
      return NextResponse.json({ error: 'Choose a JPG, PNG, WEBP, GIF, or HEIC photo.' }, { status: 400 });
    }

    const properties = await accessibleProperties(user);
    if (!properties.some((property) => property.id === propertyId)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

    const uploadFile = await prepareImageUpload(file);
    const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    uploadedPath = `${propertyId}/${crypto.randomUUID()}.${extension}`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage
      .from('property-handbook-photos')
      .upload(uploadedPath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type });
    if (uploadError) {
      if (uploadError.message.toLowerCase().includes('bucket')) return NextResponse.json({ error: 'Apply supabase/property-handbooks.sql to create the property photo storage bucket.' }, { status: 503 });
      throw uploadError;
    }

    const { data: publicUrl } = supabaseAdmin.storage.from('property-handbook-photos').getPublicUrl(upload.path);
    const { data: existingHandbook, error: existingError } = await supabaseAdmin.from('property_handbooks')
      .select('body, google_doc_url, photo_url')
      .eq('property_id', propertyId)
      .maybeSingle();
    if (existingError) throw existingError;

    const { data: handbook, error: saveError } = await supabaseAdmin.from('property_handbooks')
      .upsert({
        property_id: propertyId,
        body: existingHandbook?.body ?? '',
        google_doc_url: existingHandbook?.google_doc_url ?? null,
        photo_url: publicUrl.publicUrl,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'property_id' })
      .select('body, google_doc_url, photo_url, updated_at')
      .single();
    if (saveError) throw saveError;

    const previousPhotoUrl = existingHandbook?.photo_url;
    if (previousPhotoUrl) {
      try {
        const previousUrl = new URL(previousPhotoUrl);
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const pathPrefix = `/storage/v1/object/public/property-handbook-photos/${propertyId}/`;
        if (supabaseUrl && previousUrl.origin === new URL(supabaseUrl).origin && previousUrl.pathname.startsWith(pathPrefix)) {
          const previousPath = previousUrl.pathname.slice('/storage/v1/object/public/property-handbook-photos/'.length);
          const { error: removeError } = await supabaseAdmin.storage.from('property-handbook-photos').remove([decodeURIComponent(previousPath)]);
          if (removeError) console.error('Previous property handbook photo could not be removed:', removeError);
        }
      } catch (cleanupError) {
        console.error('Previous property handbook photo path could not be parsed for cleanup:', cleanupError);
      }
    }

    return NextResponse.json({ handbook });
  } catch (error) {
    if (uploadedPath && supabaseAdmin) {
      const { error: cleanupError } = await supabaseAdmin.storage.from('property-handbook-photos').remove([uploadedPath]);
      if (cleanupError) console.error('Property handbook photo cleanup failed:', cleanupError);
    }
    console.error('POST property handbook photo failed:', error);
    return NextResponse.json({ error: 'Property photo could not be uploaded.' }, { status: 500 });
  }
}