import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAuthenticatedRequestUser, type AuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RecordKind = 'lock' | 'garage';

const canAccess = (role: string) => role === 'owner' || role === 'manager' || role === 'maintenance';
const canManageGarages = (role: string) => role === 'owner' || role === 'manager';
const tableFor = (kind: RecordKind) => kind === 'lock' ? 'property_door_locks' : 'property_garages';

async function getProperty(propertyId: string, user: AuthenticatedRequestUser) {
  if (!supabaseAdmin) throw new Error('Supabase is not configured.');
  const organizationId = await getRequestOrganizationId(user);
  if (!organizationId) return null;
  const { data, error } = await supabaseAdmin.from('properties')
    .select('id, name, address').eq('organization_id', organizationId).eq('id', propertyId).maybeSingle();
  if (error) throw error;
  return data;
}

async function parseEntry(request: NextRequest, user: AuthenticatedRequestUser) {
  const body = await request.json();
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
  const kind: RecordKind | null = body.kind === 'lock' || body.kind === 'garage' ? body.kind : null;
  if (!kind || !propertyId || (kind === 'garage' && !canManageGarages(user.role))) {
    return { error: 'Access denied.', status: 403 } as const;
  }
  const property = await getProperty(propertyId, user);
  if (!property) return { error: 'Property not found.', status: 404 } as const;

  const unitId = body.unitId === null || body.unitId === '' ? null : body.unitId;
  if (unitId !== null) {
    if (typeof unitId !== 'string' || !supabaseAdmin) return { error: 'Invalid unit.', status: 400 } as const;
    const { data: unit, error } = await supabaseAdmin.from('units').select('id')
      .eq('id', unitId).eq('property_id', propertyId).maybeSingle();
    if (error) throw error;
    if (!unit) return { error: 'Unit does not belong to this property.', status: 400 } as const;
  }

  if (kind === 'lock') {
    const door = typeof body.door === 'string' ? body.door.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const programmingCode = typeof body.programmingCode === 'string' ? body.programmingCode.trim() : '';
    if (!door || door.length > 100 || code.length > 100 || programmingCode.length > 100) {
      return { error: 'Door and codes must be 100 characters or fewer; door is required.', status: 400 } as const;
    }
    return { kind, propertyId, values: { property_id: propertyId, unit_id: unitId, door, code, programming_code: programmingCode } } as const;
  }

  const garageId = typeof body.garageId === 'string' ? body.garageId.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const programmingCode = typeof body.programmingCode === 'string' ? body.programmingCode.trim() : '';
  const rentInput = body.garageRent;
  const garageRent = rentInput === '' || rentInput === null || rentInput === undefined ? null : Number(rentInput);
  if (!garageId || garageId.length > 100 || code.length > 100 || programmingCode.length > 100 || (garageRent !== null && (typeof rentInput !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(rentInput) || !Number.isFinite(garageRent)))) {
    return { error: 'Enter a garage ID and a valid nonnegative rent amount.', status: 400 } as const;
  }
  return { kind, propertyId, values: { property_id: propertyId, unit_id: unitId, garage_id: garageId, code, programming_code: programmingCode, garage_rent: garageRent } } as const;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!canAccess(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ properties: [], property: null, units: [], locks: [], garages: [] });
    const { data: properties, error: propertiesError } = await supabaseAdmin.from('properties')
      .select('id, name, address').eq('organization_id', organizationId).order('name');
    if (propertiesError) throw propertiesError;

    const propertyId = request.nextUrl.searchParams.get('propertyId');
    if (!propertyId) return NextResponse.json({ properties: properties ?? [], property: null, units: [], locks: [], garages: [] });
    const property = properties?.find((item) => item.id === propertyId);
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    const [unitsResult, locksResult, garagesResult] = await Promise.all([
      supabaseAdmin.from('units').select('id, unit_number').eq('property_id', propertyId).order('unit_number'),
      supabaseAdmin.from('property_door_locks').select('id, unit_id, door, code, programming_code').eq('property_id', propertyId).order('door'),
      supabaseAdmin.from('property_garages').select('id, unit_id, garage_id, code, programming_code, garage_rent').eq('property_id', propertyId).order('garage_id'),
    ]);
    if (unitsResult.error) throw unitsResult.error;
    if (locksResult.error) throw locksResult.error;
    if (garagesResult.error) throw garagesResult.error;

    return NextResponse.json({
      properties,
      property,
      units: unitsResult.data ?? [],
      locks: locksResult.data ?? [],
      garages: (garagesResult.data ?? []).map((garage) => ({ ...garage, garage_rent: canManageGarages(user.role) ? garage.garage_rent : null })),
      canManageGarages: canManageGarages(user.role),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET door codes failed:', error);
    return NextResponse.json({ error: 'Door codes could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!canAccess(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const entry = await parseEntry(request, user);
    if ('error' in entry) return NextResponse.json({ error: entry.error }, { status: entry.status });
    const { error } = entry.kind === 'lock'
      ? await supabaseAdmin.from('property_door_locks').insert(entry.values)
      : await supabaseAdmin.from('property_garages').insert(entry.values);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST door codes failed:', error);
    return NextResponse.json({ error: 'Entry could not be added. Check that its ID is unique.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!canAccess(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const entry = await parseEntry(request, user);
    if ('error' in entry) return NextResponse.json({ error: entry.error }, { status: entry.status });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Entry ID is required.' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from(tableFor(entry.kind)).update(entry.values)
      .eq('id', id).eq('property_id', entry.propertyId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH door codes failed:', error);
    return NextResponse.json({ error: 'Entry could not be updated.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!canAccess(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const kind = request.nextUrl.searchParams.get('kind');
    const propertyId = request.nextUrl.searchParams.get('propertyId');
    const id = request.nextUrl.searchParams.get('id');
    if ((kind !== 'lock' && kind !== 'garage') || !propertyId || !id || (kind === 'garage' && !canManageGarages(user.role))) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    if (!await getProperty(propertyId, user)) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    const { data, error } = await supabaseAdmin.from(tableFor(kind)).delete()
      .eq('id', id).eq('property_id', propertyId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE door codes failed:', error);
    return NextResponse.json({ error: 'Entry could not be removed.' }, { status: 500 });
  }
}