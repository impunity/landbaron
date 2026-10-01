import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { encryptSolarSecret, isSolarEncryptionConfigured } from '@/lib/solaredge';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const canManageSolar = (role: string) => role === 'owner' || role === 'manager';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!canManageSolar(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

    const organizationId = await getRequestOrganizationId(user);
    const { data: properties, error: propertiesError } = await supabaseAdmin.from('properties')
      .select('id, name, address').eq('organization_id', organizationId ?? '').order('name');
    if (propertiesError) throw propertiesError;

    const propertyIds = (properties ?? []).map((property) => property.id);
    const integrationsResult = propertyIds.length
      ? await supabaseAdmin.from('property_solar_integrations')
        .select('property_id, enabled, site_id, client_id, client_secret_encrypted, connected_at')
        .in('property_id', propertyIds)
      : { data: [], error: null };
    if (integrationsResult.error) throw integrationsResult.error;

    const integrations = new Map((integrationsResult.data ?? []).map((integration) => [integration.property_id, integration]));
    return NextResponse.json({
      properties: (properties ?? []).map((property) => {
        const integration = integrations.get(property.id);
        return {
          ...property,
          enabled: integration?.enabled ?? false,
          siteId: integration?.site_id ?? '',
          clientId: integration?.client_id ?? '',
          hasClientSecret: Boolean(integration?.client_secret_encrypted),
          connectedAt: integration?.connected_at ?? null,
        };
      }),
      apiBaseUrl: 'https://monitoringapi.solaredge.com/v2',
      authorizeUrl: 'https://connect.solaredge.com/authorize',
      tokenUrl: 'https://monitoringapi.solaredge.com/v2/oauth2/token',
      originUrl: request.nextUrl.origin,
      callbackUrl: new URL('/api/solar-power/oauth/callback', request.nextUrl.origin).toString(),
      encryptionConfigured: isSolarEncryptionConfigured(),
    });
  } catch (error) {
    console.error('GET SolarEdge settings failed:', error);
    return NextResponse.json({ error: 'SolarEdge settings could not be loaded.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!canManageSolar(user.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

    const body = await request.json();
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    if (!propertyId || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'A property and enabled setting are required.' }, { status: 400 });
    }

    const organizationId = await getRequestOrganizationId(user);
    const { data: property, error: propertyError } = await supabaseAdmin.from('properties')
      .select('id').eq('id', propertyId).eq('organization_id', organizationId ?? '').maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

    const { data: existing, error: existingError } = await supabaseAdmin.from('property_solar_integrations')
      .select('client_id, client_secret_encrypted, site_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, connected_at')
      .eq('property_id', propertyId).maybeSingle();
    if (existingError) throw existingError;

    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : '';
    const nextClientId = clientId || existing?.client_id || null;
    const nextSiteId = siteId || existing?.site_id || null;
    const credentialsChanged = Boolean(existing && (
      (nextClientId && nextClientId !== existing.client_id)
      || (clientSecret && existing.client_secret_encrypted)
      || (nextSiteId && nextSiteId !== existing.site_id)
    ));
    const values: Record<string, unknown> = {
      property_id: propertyId,
      enabled: body.enabled,
      client_id: nextClientId,
      site_id: nextSiteId,
      client_secret_encrypted: clientSecret ? encryptSolarSecret(clientSecret) : existing?.client_secret_encrypted ?? null,
      access_token_encrypted: credentialsChanged ? null : existing?.access_token_encrypted ?? null,
      refresh_token_encrypted: credentialsChanged ? null : existing?.refresh_token_encrypted ?? null,
      token_expires_at: credentialsChanged ? null : existing?.token_expires_at ?? null,
      connected_at: credentialsChanged ? null : existing?.connected_at ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('property_solar_integrations')
      .upsert(values, { onConflict: 'property_id' });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      enabled: body.enabled,
      clientId: nextClientId,
      siteId: nextSiteId,
      hasClientSecret: Boolean(clientSecret || existing?.client_secret_encrypted),
      connectedAt: credentialsChanged ? null : existing?.connected_at ?? null,
    });
  } catch (error) {
    console.error('PUT SolarEdge settings failed:', error);
    const message = error instanceof Error && error.message.includes('SOLAREDGE_ENCRYPTION_KEY')
      ? error.message
      : 'SolarEdge settings could not be saved.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}