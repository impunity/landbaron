import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

const getDescriptionParts = (description?: string | null) => {
  if (!description) {
    return { base: '', notes: '', assignment: '', hasNotes: false, hasAssignment: false };
  }

  const cleaned = description.trim();
  const assignmentMatch = cleaned.match(/^Assigned to:\s*(.+?)\n{2,}([\s\S]*)$/i);
  const noteMatch = cleaned.match(/(?:^|\n\n)Owner notes:\n([\s\S]*)$/i);

  const baseWithoutAssignment = assignmentMatch ? assignmentMatch[2].trim() : cleaned;
  const baseWithoutNotes = noteMatch ? (baseWithoutAssignment.slice(0, noteMatch.index ?? 0) ?? '').trim() : baseWithoutAssignment;

  const assignment = assignmentMatch ? assignmentMatch[1].trim() : '';
  const notes = noteMatch ? noteMatch[1].trim() : '';

  return {
    base: baseWithoutNotes.replace(/\n{3,}/g, '\n\n').trim(),
    notes,
    assignment,
    hasNotes: Boolean(notes),
    hasAssignment: Boolean(assignment),
  };
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
    const { notes, status, assigned_to } = await request.json();

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

    const { data: existingTicket, error: fetchError } = await supabaseAdmin
      .from('tickets')
      .select('description')
      .eq('id', ticketId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    const currentDescription = existingTicket?.description ?? '';
    const parsedDescription = getDescriptionParts(currentDescription);
    const baseDescription = parsedDescription.base;
    const currentNotes = parsedDescription.notes;
    const currentAssignment = parsedDescription.assignment;

    const nextDescriptionParts: string[] = [];

    if (typeof assigned_to === 'string') {
      const trimmedAssignee = assigned_to.trim();
      const nextAssignment = trimmedAssignee ? `Assigned to: ${trimmedAssignee}` : '';

      if (nextAssignment) {
        nextDescriptionParts.push(nextAssignment);
      }
    } else if (currentAssignment) {
      nextDescriptionParts.push(`Assigned to: ${currentAssignment}`);
    }

    let nextBaseDescription = baseDescription;
    let nextNotes = currentNotes;

    if (typeof notes === 'string') {
      const trimmedNotes = notes.trim();
      nextNotes = trimmedNotes;
    }

    if (nextBaseDescription) {
      nextDescriptionParts.push(nextBaseDescription);
    }

    if (nextNotes) {
      nextDescriptionParts.push(`Owner notes:\n${nextNotes}`);
    }

    if (typeof assigned_to === 'string' && !assigned_to.trim()) {
      const index = nextDescriptionParts.findIndex((part) => part.startsWith('Assigned to:'));
      if (index >= 0) {
        nextDescriptionParts.splice(index, 1);
      }
    }

    if (typeof assigned_to === 'string') {
      updates.description = nextDescriptionParts.join('\n\n') || null;
    }

    if (typeof notes === 'string') {
      updates.description = nextDescriptionParts.join('\n\n') || null;
    }

    if (typeof assigned_to === 'string' && !assigned_to.trim() && !currentNotes && !baseDescription) {
      updates.description = null;
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
