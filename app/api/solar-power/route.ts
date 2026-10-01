import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { decryptSolarSecret, encryptSolarSecret, SOLAREDGE_API_BASE_URL, SOLAREDGE_TOKEN_URL } from '@/lib/solaredge';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function getAccessToken(integration: Record<string, unknown>) {
  const expiresAt = typeof integration.token_expires_at === 'string' ? Date.parse(integration.token_expires_at) : 0;
  if (typeof integration.access_token_encrypted === 'string' && expiresAt > Date.now() + 60_000) {
    return decryptSolarSecret(integration.access_token_encrypted);
  }

  if (typeof integration.refresh_token_encrypted !== 'string' || typeof integration.client_secret_encrypted !== 'string' || typeof integration.client_id !== 'string') {
    throw new Error('SolarEdge authorization needs to be reconnected.');
  }
  const currentRefreshToken = decryptSolarSecret(integration.refresh_token_encrypted);
  const response = await fetch(SOLAREDGE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: integration.client_id,
      client_secret: decryptSolarSecret(integration.client_secret_encrypted),
    }),
    cache: 'no-store',
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || typeof token.access_token !== 'string') {
    throw new Error('SolarEdge authorization needs to be reconnected.');
  }

  const accessToken = token.access_token as string;
  const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token : currentRefreshToken;
  const expiresIn = Number(token.expires_in) || 7200;
  const expires = new Date(Date.now() + expiresIn * 1000).toISOString();
  const { error } = await supabaseAdmin!.from('property_solar_integrations').update({
    access_token_encrypted: encryptSolarSecret(accessToken),
    refresh_token_encrypted: encryptSolarSecret(refreshToken),
    token_expires_at: expires,
    updated_at: new Date().toISOString(),
  }).eq('property_id', integration.property_id);
  if (error) throw error;
  return accessToken;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ properties: [] });

    const { data: properties, error: propertiesError } = await supabaseAdmin.from('properties')
      .select('id, name').eq('organization_id', organizationId).order('name');
    if (propertiesError) throw propertiesError;
    const propertyIds = (properties ?? []).map((property) => property.id);
    if (!propertyIds.length) return NextResponse.json({ properties: [] });

    const { data: integrations, error: integrationsError } = await supabaseAdmin.from('property_solar_integrations')
      .select('property_id, enabled, site_id, client_id, client_secret_encrypted, access_token_encrypted, refresh_token_encrypted, token_expires_at')
      .eq('enabled', true).in('property_id', propertyIds);
    if (integrationsError) throw integrationsError;

    const propertyMap = new Map((properties ?? []).map((property) => [property.id, property]));
    const solarProperties = await Promise.all((integrations ?? []).map(async (integration) => {
      const property = propertyMap.get(integration.property_id);
      if (!property) return null;
      if (!integration.site_id || !integration.access_token_encrypted) {
        return { id: property.id, name: property.name, siteId: integration.site_id, status: 'not_connected' };
      }
      try {
        const accessToken = await getAccessToken(integration as unknown as Record<string, unknown>);
        const response = await fetch(`${SOLAREDGE_API_BASE_URL}/sites/${encodeURIComponent(integration.site_id)}/overview`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('SolarEdge overview request failed.');
        const overview = await response.json();
        return { id: property.id, name: property.name, siteId: integration.site_id, status: 'connected', overview };
      } catch (error) {
        console.error(`SolarEdge data load failed for property ${property.id}:`, error);
        return { id: property.id, name: property.name, siteId: integration.site_id, status: 'error' };
      }
    }));

    return NextResponse.json({ properties: solarProperties.filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET SolarEdge data failed:', error);
    return NextResponse.json({ error: 'Solar power data could not be loaded.' }, { status: 500 });
  }
}