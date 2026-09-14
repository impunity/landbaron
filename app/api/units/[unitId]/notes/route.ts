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
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const note = String(body?.note ?? '').trim();
    const category = body?.category === 'work_to_consider' || body?.category === 'general'
      ? body.category
      : 'completed_work';
    const cost = body?.cost !== undefined && body?.cost !== '' && body?.cost !== null
      ? Number(body.cost)
      : null;
    const performed_by = typeof body?.performed_by === 'string' ? body.performed_by.trim() : user.email;
    const performed_at = typeof body?.performed_at === 'string' && body.performed_at.trim()
      ? body.performed_at.trim()
      : new Date().toISOString().split('T')[0];

    if (!note) {
      return NextResponse.json({ error: 'Maintenance note content is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('unit_maintenance_notes')
      .insert([
        {
          unit_id: unitId,
          note,
          category,
          cost,
          performed_by,
          performed_at,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, note: data });
  } catch (error) {
    console.error('POST /api/units/[unitId]/notes failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Maintenance note could not be saved.' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const noteId = String(body?.id ?? '').trim();

    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.note === 'string') updates.note = body.note.trim();
    if (typeof body.category === 'string') updates.category = body.category.trim();
    if (body.cost !== undefined) updates.cost = body.cost !== '' && body.cost !== null ? Number(body.cost) : null;
    if (body.performed_by !== undefined) updates.performed_by = typeof body.performed_by === 'string' ? body.performed_by.trim() : null;
    if (body.performed_at !== undefined) updates.performed_at = typeof body.performed_at === 'string' ? body.performed_at.trim() : null;

    const { data, error } = await supabaseAdmin
      .from('unit_maintenance_notes')
      .update(updates)
      .eq('id', noteId)
      .eq('unit_id', unitId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, note: data });
  } catch (error) {
    console.error('PATCH /api/units/[unitId]/notes failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Maintenance note could not be updated.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const { unitId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const noteId = new URL(request.url).searchParams.get('noteId');
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('unit_maintenance_notes')
      .delete()
      .eq('id', noteId)
      .eq('unit_id', unitId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/units/[unitId]/notes failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Maintenance note could not be deleted.' },
      { status: 500 },
    );
  }
}
