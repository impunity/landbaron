import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    return NextResponse.json({ ticket: data });
  } catch (error) {
    console.error('GET /api/tickets/[ticketId] failed:', error);
    return NextResponse.json(
      { error: 'Unable to load ticket details right now.' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const { notes, status } = await request.json();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const validStatuses = ['Open', 'In Progress', 'Waiting on Parts', 'Resolved', 'Closed'];
    const updates: Record<string, string | null> = {};

    if (typeof status === 'string') {
      const normalizedStatus = status.trim();
      if (!validStatuses.includes(normalizedStatus)) {
        return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
      }
      updates.status = normalizedStatus;

      if (normalizedStatus === 'Resolved') {
        updates.resolved_at = new Date().toISOString();
      }
    }

    if (typeof notes === 'string') {
      const { data: existingTicket, error: fetchError } = await supabaseAdmin
        .from('tickets')
        .select('description')
        .eq('id', ticketId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      const currentDescription = existingTicket?.description ?? '';
      const trimmedNotes = notes.trim();
      const noteText = trimmedNotes
        ? `${currentDescription ? `${currentDescription.trim()}\n\n` : ''}Owner notes:\n${trimmedNotes}`
        : currentDescription;

      updates.description = noteText;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('tickets')
      .update(updates)
      .eq('id', ticketId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/tickets/[ticketId] failed:', error);
    return NextResponse.json(
      { error: 'Ticket update failed. Please try again.' },
      { status: 500 },
    );
  }
}
