import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAuthenticatedRequestUser, type AuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RecordKind = 'lock' | 'garage';
type UnitRecord = { id: string; unit_number: string; tenants?: { name: string }[]; unit_photos?: { photo_url: string; is_primary: boolean | null; created_at: string }[] };
type LockRecord = { id: string; unit_id: string | null; door: string; lock_group: string | null; code: string; programming_code?: string; photo_url: string | null };
type GarageRecord = { id: string; unit_id: string | null; owner_assigned: boolean; garage_id: string; code: string; programming_code?: string; garage_rent?: number | null };

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
    const lockGroup = body.lockGroup;
    if (lockGroup !== undefined && !['gate', 'other', 'entrance'].includes(lockGroup)) {
      return { error: 'Invalid lock category.', status: 400 } as const;
    }
    if (lockGroup === 'gate' && unitId !== null) {
      return { error: 'Gate locks must belong to the property, not a unit.', status: 400 } as const;
    }
    return { kind, propertyId, values: { property_id: propertyId, unit_id: unitId, door, code, programming_code: programmingCode, ...(lockGroup !== undefined ? { lock_group: lockGroup } : {}) } } as const;
  }

  const ownerAssigned = body.ownerAssigned === true;
  if (ownerAssigned && unitId !== null) {
    return { error: 'A garage cannot be assigned to both the owner and a unit.', status: 400 } as const;
  }
  const garageId = typeof body.garageId === 'string' ? body.garageId.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const programmingCode = typeof body.programmingCode === 'string' ? body.programmingCode.trim() : '';
  const rentInput = body.garageRent;
  const garageRent = rentInput === '' || rentInput === null || rentInput === undefined ? null : Number(rentInput);
  if (!garageId || garageId.length > 100 || code.length > 100 || programmingCode.length > 100 || (garageRent !== null && (typeof rentInput !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(rentInput) || !Number.isFinite(garageRent)))) {
    return { error: 'Enter a garage ID and a valid nonnegative rent amount.', status: 400 } as const;
  }
  return { kind, propertyId, values: { property_id: propertyId, unit_id: unitId, owner_assigned: ownerAssigned, garage_id: garageId, code, programming_code: programmingCode, garage_rent: garageRent } } as const;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const isTenant = user.role === 'tenant';
    if (!canAccess(user.role) && !isTenant) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    const organizationId = await getRequestOrganizationId(user);
    const emptyData = { properties: [], property: null, units: [], locks: [], garages: [], canManageLocks: canAccess(user.role), canManageGarages: canManageGarages(user.role) };
    if (!organizationId) return NextResponse.json(emptyData, { headers: { 'Cache-Control': 'no-store' } });
    const requestedPropertyId = request.nextUrl.searchParams.get('propertyId');
    let tenantUnitId: string | null = null;
    let tenantPropertyId: string | null = null;
    if (isTenant) {
      const { data: tenant, error: tenantError } = await supabaseAdmin.from('tenants').select('unit_id').ilike('email', user.email).eq('status', 'active').limit(1).maybeSingle();
      if (tenantError) throw tenantError;
      if (!tenant?.unit_id) return NextResponse.json(emptyData, { headers: { 'Cache-Control': 'no-store' } });
      const { data: unit, error: unitError } = await supabaseAdmin.from('units').select('id, property_id').eq('id', tenant.unit_id).maybeSingle();
      if (unitError) throw unitError;
      if (!unit) return NextResponse.json(emptyData, { headers: { 'Cache-Control': 'no-store' } });
      tenantUnitId = unit.id;
      tenantPropertyId = unit.property_id;
      if (requestedPropertyId && requestedPropertyId !== tenantPropertyId) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }
    let propertiesQuery = supabaseAdmin.from('properties').select('id, name, address').eq('organization_id', organizationId).order('name');
    if (tenantPropertyId) propertiesQuery = propertiesQuery.eq('id', tenantPropertyId);
    const { data: properties, error: propertiesError } = await propertiesQuery;
    if (propertiesError) throw propertiesError;

    const propertyId = tenantPropertyId ?? requestedPropertyId;
    if (!propertyId) return NextResponse.json({ ...emptyData, properties: properties ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
    const property = properties?.find((item) => item.id === propertyId);
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    let unitsQuery = supabaseAdmin.from('units').select(isTenant ? 'id, unit_number, unit_photos(photo_url, is_primary, created_at)' : 'id, unit_number, tenants(name), unit_photos(photo_url, is_primary, created_at)').eq('property_id', propertyId).order('unit_number');
    let locksQuery = supabaseAdmin.from('property_door_locks').select(isTenant ? 'id, unit_id, door, lock_group, code, photo_url' : 'id, unit_id, door, lock_group, code, programming_code, photo_url').eq('property_id', propertyId).order('door');
    let garagesQuery = supabaseAdmin.from('property_garages').select(isTenant ? 'id, unit_id, owner_assigned, garage_id, code' : 'id, unit_id, owner_assigned, garage_id, code, programming_code, garage_rent').eq('property_id', propertyId).order('garage_id');
    if (isTenant && tenantUnitId) {
      unitsQuery = unitsQuery.eq('id', tenantUnitId);
      locksQuery = locksQuery.or(`unit_id.is.null,unit_id.eq.${tenantUnitId}`);
      garagesQuery = garagesQuery.eq('unit_id', tenantUnitId).eq('owner_assigned', false);
    }
    const [unitsResult, locksResult, garagesResult] = await Promise.all([
      unitsQuery.overrideTypes<UnitRecord[], { merge: false }>(),
      locksQuery.overrideTypes<LockRecord[], { merge: false }>(),
      garagesQuery.overrideTypes<GarageRecord[], { merge: false }>(),
    ]);
    if (unitsResult.error) throw unitsResult.error;
    if (locksResult.error) throw locksResult.error;
    if (garagesResult.error) throw garagesResult.error;

    return NextResponse.json({
      properties,
      property,
      units: (unitsResult.data ?? []).map((unit) => ({
        ...unit,
        unit_photos: [...(unit.unit_photos ?? [])].sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)) || new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
      })),
      locks: (locksResult.data ?? []).map((lock) => ({ ...lock, programming_code: isTenant ? '' : lock.programming_code ?? '' })),
      garages: (garagesResult.data ?? []).map((garage) => ({ ...garage, programming_code: isTenant ? '' : garage.programming_code ?? '', garage_rent: canManageGarages(user.role) ? garage.garage_rent ?? null : null })),
      canManageLocks: canAccess(user.role),
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