import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role !== 'owner' && user.role !== 'manager') {
      return NextResponse.json({ error: 'Owner or manager access is required.' }, { status: 403 });
    }

    const { label, amount } = await request.json();
    const trimmedLabel = typeof label === 'string' ? label.trim() : '';

    if (!trimmedLabel) {
      return NextResponse.json({ error: 'A fee label is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('unit_fees')
      .insert([{ unit_id: unitId, label: trimmedLabel, amount: Number(amount) || 0 }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, fee: data });
  } catch (error) {
    console.error('POST /api/units/[unitId]/fees failed:', error);
    return NextResponse.json({ error: 'Fee could not be saved.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role !== 'owner' && user.role !== 'manager') {
      return NextResponse.json({ error: 'Owner or manager access is required.' }, { status: 403 });
    }

    const feeId = request.nextUrl.searchParams.get('feeId');
    if (!feeId) {
      return NextResponse.json({ error: 'A fee id is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('unit_fees')
      .delete()
      .eq('id', feeId)
      .eq('unit_id', unitId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/units/[unitId]/fees failed:', error);
    return NextResponse.json({ error: 'Fee could not be removed.' }, { status: 500 });
  }
}
