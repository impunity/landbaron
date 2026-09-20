import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeWebsite = (value: unknown) => {
  const rawWebsite = getString(value);
  if (!rawWebsite) return '';
  const withProtocol = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
  try {
    const url = new URL(withProtocol);
    return url.toString();
  } catch {
    return rawWebsite;
  }
};

const getMetaContent = (html: string, key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
};

const extractVendorAddress = (html: string) => {
  const structuredAddress = html.match(/"streetAddress"\s*:\s*"([^"]+)"[\s\S]{0,400}?"addressLocality"\s*:\s*"([^"]+)"[\s\S]{0,200}?"addressRegion"\s*:\s*"([^"]+)"/i);
  if (structuredAddress) {
    return [structuredAddress[1], structuredAddress[2], structuredAddress[3]].filter(Boolean).join(', ');
  }

  const addressMatch = html.replace(/<[^>]+>/g, ' ').match(/\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?)\b[^<]{0,120}/i);
  return addressMatch?.[0].replace(/\s+/g, ' ').trim() ?? '';
};

const fetchVendorWebsiteInfo = async (website: string) => {
  if (!website) return { website_title: null, website_description: null, website_thumbnail_url: null, address: null };
  try {
    const response = await fetch(website, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { website_title: null, website_description: null, website_thumbnail_url: null, address: null };
    const html = await response.text();
    const title = getMetaContent(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
    const description = getMetaContent(html, 'og:description') || getMetaContent(html, 'description');
    const thumbnail = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image');
    const address = extractVendorAddress(html);
    const thumbnailUrl = thumbnail ? new URL(thumbnail, website).toString() : null;
    return {
      website_title: title || null,
      website_description: description || null,
      website_thumbnail_url: thumbnailUrl,
      address: address || null,
    };
  } catch {
    return { website_title: null, website_description: null, website_thumbnail_url: null, address: null };
  }
};

const getVendorErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  if (/website|address|website_thumbnail_url|website_title|website_description/i.test(message) && /column|schema cache/i.test(message)) {
    return 'Vendor website fields are not in Supabase yet. Run supabase/vendor-website.sql, then try again.';
  }
  return message || fallback;
};

const isMissingEnrichmentColumnError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  return /address|website_thumbnail_url|website_title|website_description/i.test(message) && /column|schema cache/i.test(message);
};

async function authorize(request: NextRequest, allowTenant = false) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) return { user: null, response: NextResponse.json({ error: 'Sign in is required.' }, { status: 401 }) };
  if (allowTenant && user.role === 'tenant') return { user, response: null };
  if (!['owner', 'maintenance', 'contractor'].includes(user.role)) return { user: null, response: NextResponse.json({ error: 'Staff access is required.' }, { status: 403 }) };
  return { user, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, true);
    if (auth.response) return auth.response;
    const { data, error } = await supabaseAdmin!.from('approved_vendors').select('*').order('name');
    if (error) throw error;
    return NextResponse.json({ vendors: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: getVendorErrorMessage(error, 'Vendors could not be loaded.') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const name = getString(body?.name);
    const phone = getString(body?.phone);
    const website = normalizeWebsite(body?.website);
    if (!name) return NextResponse.json({ error: 'Vendor name is required.' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'Vendor phone number is required.' }, { status: 400 });
    const websiteInfo = await fetchVendorWebsiteInfo(website);
    let { data, error } = await supabaseAdmin!.from('approved_vendors').insert({ name, company: getString(body?.company) || null, email: getString(body?.email) || null, phone, service_type: getString(body?.service_type) || null, website: website || null, address: getString(body?.address) || websiteInfo.address, website_title: websiteInfo.website_title, website_description: websiteInfo.website_description, website_thumbnail_url: websiteInfo.website_thumbnail_url, notes: getString(body?.notes) || null }).select().single();
    if (error && isMissingEnrichmentColumnError(error)) {
      const retry = await supabaseAdmin!.from('approved_vendors').insert({ name, company: getString(body?.company) || null, email: getString(body?.email) || null, phone, service_type: getString(body?.service_type) || null, website: website || null, notes: getString(body?.notes) || null }).select().single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, vendor: data });
  } catch (error) {
    return NextResponse.json({ error: getVendorErrorMessage(error, 'Vendor could not be added.') }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Vendor ID is required.' }, { status: 400 });
    const body = await request.json();
    const name = getString(body?.name);
    const phone = getString(body?.phone);
    const website = normalizeWebsite(body?.website);
    if (!name) return NextResponse.json({ error: 'Vendor name is required.' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'Vendor phone number is required.' }, { status: 400 });
    const websiteInfo = await fetchVendorWebsiteInfo(website);
    let { data, error } = await supabaseAdmin!.from('approved_vendors').update({ name, company: getString(body?.company) || null, email: getString(body?.email) || null, phone, service_type: getString(body?.service_type) || null, website: website || null, address: getString(body?.address) || websiteInfo.address, website_title: websiteInfo.website_title, website_description: websiteInfo.website_description, website_thumbnail_url: websiteInfo.website_thumbnail_url, notes: getString(body?.notes) || null }).eq('id', id).select().single();
    if (error && isMissingEnrichmentColumnError(error)) {
      const retry = await supabaseAdmin!.from('approved_vendors').update({ name, company: getString(body?.company) || null, email: getString(body?.email) || null, phone, service_type: getString(body?.service_type) || null, website: website || null, notes: getString(body?.notes) || null }).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, vendor: data });
  } catch (error) {
    return NextResponse.json({ error: getVendorErrorMessage(error, 'Vendor could not be updated.') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Vendor ID is required.' }, { status: 400 });
    const { error } = await supabaseAdmin!.from('approved_vendors').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Vendor could not be removed.' }, { status: 500 });
  }
}
