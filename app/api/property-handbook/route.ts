import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
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
      supabaseAdmin.from('property_handbooks').select('body, google_doc_url, updated_at').eq('property_id', property.id).maybeSingle(),
    ]);
    if (units.error) throw units.error;
    if (handbook.error) {
      if (handbook.error.code === 'PGRST205' || handbook.error.code === '42P01') return NextResponse.json({ error: 'Apply supabase/property-handbooks.sql in Supabase to enable the handbook.' }, { status: 503 });
      throw handbook.error;
    }
    return NextResponse.json({ properties, property, canEdit, unitCount: units.count ?? 0, handbook: handbook.data ?? { body: '', google_doc_url: null, updated_at: null } }, { headers: { 'Cache-Control': 'no-store' } });
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
    const { data, error } = await supabaseAdmin.from('property_handbooks').upsert({ property_id: input.propertyId, body: input.body, google_doc_url: docUrl, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'property_id' }).select('body, google_doc_url, updated_at').single();
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return NextResponse.json({ error: 'Apply supabase/property-handbooks.sql in Supabase to enable the handbook.' }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ handbook: data });
  } catch (error) {
    console.error('PUT property handbook failed:', error);
    return NextResponse.json({ error: 'Property handbook could not be saved.' }, { status: 500 });
  }
}