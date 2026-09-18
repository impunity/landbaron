import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function authorize(request: NextRequest) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) return { user: null, response: NextResponse.json({ error: 'Sign in is required.' }, { status: 401 }) };
  if (!['owner', 'maintenance', 'contractor'].includes(user.role)) return { user: null, response: NextResponse.json({ error: 'Staff access is required.' }, { status: 403 }) };
  return { user, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const { data, error } = await supabaseAdmin!.from('approved_vendors').select('*').order('name');
    if (error) throw error;
    return NextResponse.json({ vendors: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Vendors could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Vendor name is required.' }, { status: 400 });
    const { data, error } = await supabaseAdmin!.from('approved_vendors').insert({ name, company: body.company?.trim() || null, email: body.email?.trim() || null, phone: body.phone?.trim() || null, service_type: body.service_type?.trim() || null, notes: body.notes?.trim() || null }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, vendor: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Vendor could not be added.' }, { status: 500 });
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
