import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendAccessRequestEmail } from '@/lib/access-request-email';

const allowedRoles = new Set(['tenant', 'maintenance', 'contractor', 'manager']);

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const body = await request.json();
    const inviteCode = typeof body.invite_code === 'string' ? body.invite_code.trim().toUpperCase() : '';
    const requestedRole = typeof body.requested_role === 'string' ? body.requested_role.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';

    if (!inviteCode || !allowedRoles.has(requestedRole) || !name || !email || !phone || !address) {
      return NextResponse.json({ error: 'Invite code, role, name, email, phone, and address are required.' }, { status: 400 });
    }

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, owner_email, contact_email')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (organizationError) throw organizationError;
    if (!organization) return NextResponse.json({ error: 'That invite code was not found.' }, { status: 404 });

    const { data: requestRecord, error } = await supabaseAdmin
      .from('access_requests')
      .insert([{
        organization_id: organization.id,
        requested_role: requestedRole,
        name,
        email,
        phone,
        address,
      }])
      .select('id, token, status, created_at')
      .single();

    if (error) throw error;

    const ownerEmail = organization.owner_email || organization.contact_email || process.env.NEXT_PUBLIC_OWNER_EMAILS?.split(',')[0]?.trim();
    let notificationError: string | null = null;

    if (ownerEmail && requestRecord) {
      try {
        await sendAccessRequestEmail({
          ownerEmail,
          organizationName: organization.name,
          requestId: requestRecord.id,
          token: requestRecord.token,
          requestedRole,
          name,
          email,
          phone,
          address,
        });
      } catch (emailError) {
        console.error('Access request email failed:', emailError);
        notificationError = 'The request was saved, but the owner email could not be sent.';
      }
    } else {
      notificationError = 'The request was saved, but no organization owner email is configured.';
    }

    return NextResponse.json({ ok: true, notificationError });
  } catch (error) {
    console.error('POST /api/access-requests failed:', error);
    return NextResponse.json({ error: 'Access request could not be submitted.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });

    const user = await getAuthenticatedRequestUser(request);
    if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
      return NextResponse.json({ error: 'Owner or manager access is required.' }, { status: 403 });
    }

    const token = request.nextUrl.searchParams.get('token')?.trim();
    if (!token) return NextResponse.json({ error: 'Request token is required.' }, { status: 400 });

    const { data: accessRequest, error } = await supabaseAdmin
      .from('access_requests')
      .select('*, organizations(id, name), units(id, unit_number, property_id, properties(id, name, address))')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    if (!accessRequest) return NextResponse.json({ error: 'Access request not found.' }, { status: 404 });

    const { data: properties } = await supabaseAdmin
      .from('properties')
      .select('id, name, address, units(id, unit_number, property_id)')
      .eq('organization_id', (accessRequest as { organization_id: string }).organization_id)
      .order('name');

    return NextResponse.json({ request: accessRequest, properties: properties ?? [] });
  } catch (error) {
    console.error('GET /api/access-requests failed:', error);
    return NextResponse.json({ error: 'Unable to load access request.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });

    const user = await getAuthenticatedRequestUser(request);
    if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
      return NextResponse.json({ error: 'Owner or manager access is required.' }, { status: 403 });
    }

    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const action = body.action === 'decline' ? 'declined' : 'accepted';
    const unitId = typeof body.unit_id === 'string' && body.unit_id ? body.unit_id : null;

    const { data: accessRequest, error: requestError } = await supabaseAdmin
      .from('access_requests')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!accessRequest) return NextResponse.json({ error: 'Access request not found.' }, { status: 404 });
    if (accessRequest.status !== 'pending') return NextResponse.json({ error: 'This request has already been resolved.' }, { status: 409 });

    if (action === 'accepted') {
      if (accessRequest.requested_role === 'tenant') {
        if (!unitId) return NextResponse.json({ error: 'Select a property and unit for this tenant.' }, { status: 400 });
        const { data: unit } = await supabaseAdmin.from('units').select('id, property_id, organization_id').eq('id', unitId).maybeSingle();
        if (!unit || unit.organization_id !== accessRequest.organization_id) return NextResponse.json({ error: 'That unit is not part of this organization.' }, { status: 400 });

        const { error } = await supabaseAdmin.from('tenants').upsert({
          organization_id: accessRequest.organization_id,
          unit_id: unit.id,
          property_id: unit.property_id,
          name: accessRequest.name,
          email: accessRequest.email,
          phone: accessRequest.phone,
          status: 'active',
        }, { onConflict: 'id' });
        if (error) throw error;
      } else {
        const role = accessRequest.requested_role === 'manager' ? 'Manager' : accessRequest.requested_role === 'contractor' ? 'Contractor' : 'Maintenance';
        const { error } = await supabaseAdmin.from('staff_members').upsert({
          organization_id: accessRequest.organization_id,
          name: accessRequest.name,
          email: accessRequest.email,
          phone_number: accessRequest.phone,
          role,
        }, { onConflict: 'email' });
        if (error) throw error;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('access_requests')
      .update({ status: action, resolved_at: new Date().toISOString(), unit_id: unitId })
      .eq('id', accessRequest.id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, status: action });
  } catch (error) {
    console.error('PATCH /api/access-requests failed:', error);
    return NextResponse.json({ error: 'Access request could not be resolved.' }, { status: 500 });
  }
}
