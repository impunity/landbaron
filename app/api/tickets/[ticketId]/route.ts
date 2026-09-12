import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

const getDescriptionParts = (description?: string | null) => {
  if (!description) {
    return { base: '', notes: '', hasNotes: false };
  }

  const noteMatch = description.match(/(?:^|\n\n)Owner notes:\n([\s\S]*)$/i);

  if (!noteMatch) {
    return { base: description.trim(), notes: '', hasNotes: false };
  }

  const base = (description.slice(0, noteMatch.index ?? 0) ?? '').replace(/\n{3,}$/g, '').trim();
  const notes = noteMatch[1].trim();

  return { base, notes, hasNotes: Boolean(notes) };
};

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

      if (normalizedStatus === 'Resolved' || normalizedStatus === 'Closed') {
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

      const { base: baseDescription } = getDescriptionParts(existingTicket?.description ?? '');
      const trimmedNotes = notes.trim();
      const nextDescription = trimmedNotes
        ? `${baseDescription ? `${baseDescription}\n\n` : ''}Owner notes:\n${trimmedNotes}`
        : baseDescription;

      updates.description = nextDescription || null;
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const userEmail = request.headers.get('x-user-email')?.trim().toLowerCase();
    const userRole = request.headers.get('x-user-role')?.trim().toLowerCase();
    const allowedOwnerEmails = (process.env.NEXT_PUBLIC_OWNER_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    if (!userEmail || userRole !== 'owner' || !allowedOwnerEmails.includes(userEmail)) {
      return NextResponse.json({ error: 'Only the owner can delete tickets.' }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('tickets').delete().eq('id', ticketId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/tickets/[ticketId] failed:', error);
    return NextResponse.json(
      { error: 'Ticket could not be deleted.' },
      { status: 500 },
    );
  }
}
