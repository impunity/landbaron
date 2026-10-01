import { NextRequest, NextResponse } from 'next/server';

import { encryptSolarSecret, SOLAREDGE_TOKEN_URL, decryptSolarSecret } from '@/lib/solaredge';
import { supabaseAdmin } from '@/lib/supabase-admin';

function finish(request: NextRequest, result: 'connected' | 'failed', propertyId?: string) {
  const destination = new URL('/dashboard/solar-power', request.nextUrl.origin);
  destination.searchParams.set('connection', result);
  if (propertyId) destination.searchParams.set('propertyId', propertyId);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return finish(request, 'failed');
    const state = request.nextUrl.searchParams.get('state');
    const code = request.nextUrl.searchParams.get('code');
    const providerError = request.nextUrl.searchParams.get('error');
    if (!state) return finish(request, 'failed');

    const { data: oauthState, error: stateError } = await supabaseAdmin.from('solar_oauth_states')
      .select('state, property_id').eq('state', state).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (stateError) throw stateError;
    if (!oauthState) return finish(request, 'failed');
    const { error: deleteStateError } = await supabaseAdmin.from('solar_oauth_states').delete().eq('state', state);
    if (deleteStateError) throw deleteStateError;
    if (providerError || !code) return finish(request, 'failed', oauthState.property_id);

    const { data: integration, error: integrationError } = await supabaseAdmin.from('property_solar_integrations')
      .select('client_id, client_secret_encrypted, site_id')
      .eq('property_id', oauthState.property_id).maybeSingle();
    if (integrationError) throw integrationError;
    if (!integration?.client_id || !integration.client_secret_encrypted) {
      return finish(request, 'failed', oauthState.property_id);
    }

    const redirectUri = new URL('/api/solar-power/oauth/callback', request.nextUrl.origin).toString();
    const tokenResponse = await fetch(SOLAREDGE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: integration.client_id,
        client_secret: decryptSolarSecret(integration.client_secret_encrypted),
        redirect_uri: redirectUri,
      }),
      cache: 'no-store',
    });
    const token = await tokenResponse.json().catch(() => ({}));
    const siteId = request.nextUrl.searchParams.get('site_id') || integration.site_id;
    if (!tokenResponse.ok || typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string' || !siteId) {
      return finish(request, 'failed', oauthState.property_id);
    }

    const expiresIn = Number(token.expires_in) || 7200;
    const { error: updateError } = await supabaseAdmin.from('property_solar_integrations').update({
      site_id: siteId,
      access_token_encrypted: encryptSolarSecret(token.access_token),
      refresh_token_encrypted: encryptSolarSecret(token.refresh_token),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('property_id', oauthState.property_id);
    if (updateError) throw updateError;
    return finish(request, 'connected', oauthState.property_id);
  } catch (error) {
    console.error('SolarEdge OAuth callback failed:', error);
    return finish(request, 'failed');
  }
}