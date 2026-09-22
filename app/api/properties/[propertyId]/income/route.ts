import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await params;

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
      return NextResponse.json({ error: 'An income label is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('property_income_sources')
      .insert([{ property_id: propertyId, label: trimmedLabel, amount: Number(amount) || 0 }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, income: data });
  } catch (error) {
    console.error('POST /api/properties/[propertyId]/income failed:', error);
    return NextResponse.json({ error: 'Income source could not be saved.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await params;

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

    const incomeId = request.nextUrl.searchParams.get('incomeId');
    if (!incomeId) {
      return NextResponse.json({ error: 'An income id is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('property_income_sources')
      .delete()
      .eq('id', incomeId)
      .eq('property_id', propertyId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/properties/[propertyId]/income failed:', error);
    return NextResponse.json({ error: 'Income source could not be removed.' }, { status: 500 });
  }
}
