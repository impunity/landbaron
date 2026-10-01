import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { SOLAREDGE_AUTHORIZE_URL, SOLAREDGE_SCOPES } from '@/lib/solaredge';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'manager') return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

    const { propertyId } = await request.json();
    if (typeof propertyId !== 'string' || !propertyId) {
      return NextResponse.json({ error: 'A property is required.' }, { status: 400 });
    }
    const organizationId = await getRequestOrganizationId(user);
    const { data: property, error: propertyError } = await supabaseAdmin.from('properties')
      .select('id').eq('id', propertyId).eq('organization_id', organizationId ?? '').maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

    const { data: integration, error: integrationError } = await supabaseAdmin.from('property_solar_integrations')
      .select('enabled, client_id, client_secret_encrypted')
      .eq('property_id', propertyId).maybeSingle();
    if (integrationError) throw integrationError;
    if (!integration?.enabled || !integration.client_id || !integration.client_secret_encrypted) {
      return NextResponse.json({ error: 'Enable solar power and save the SolarEdge Client ID and Client Secret first.' }, { status: 400 });
    }

    const state = randomUUID();
    const { error: stateError } = await supabaseAdmin.from('solar_oauth_states').insert({
      state,
      property_id: propertyId,
      user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw stateError;

    const callbackUrl = new URL('/api/solar-power/oauth/callback', request.nextUrl.origin).toString();
    const authorizeUrl = new URL(SOLAREDGE_AUTHORIZE_URL);
    authorizeUrl.search = new URLSearchParams({
      client_id: integration.client_id,
      scope: SOLAREDGE_SCOPES,
      redirect_uri: callbackUrl,
      state,
      access_duration: '24',
    }).toString();
    return NextResponse.json({ authorizeUrl: authorizeUrl.toString() });
  } catch (error) {
    console.error('Start SolarEdge OAuth failed:', error);
    return NextResponse.json({ error: 'SolarEdge authorization could not be started.' }, { status: 500 });
  }
}