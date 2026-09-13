  const validStatuses = ['Open', 'In Progress', 'Waiting on Parts', 'Resolved', 'Closed', 'Archived'];
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

const getDescriptionParts = (description?: string | null) => {
  if (!description) {
    return { base: '', notes: '', assignment: '', hasNotes: false, hasAssignment: false };
  }

  const cleaned = description.trim();
  const sections = cleaned
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  let assignment = '';
  let notes = '';
  const baseParts: string[] = [];

  for (const section of sections) {
    const assignmentMatch = section.match(/(?:^|\n)Assigned to:\s*([^\n]+)/i);
    if (assignmentMatch) {
      assignment = assignmentMatch[1].trim();
      continue;
    }

    if (/^Owner notes:/i.test(section)) {
      notes = section.replace(/^Owner notes:\s*/i, '').trim();
      continue;
    }

    baseParts.push(section.replace(/^Owner notes:\s*/i, '').replace(/^Assigned to:\s*/i, '').trim());
  }

  return {
    base: baseParts.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    notes,
    assignment,
    hasNotes: Boolean(notes),
    hasAssignment: Boolean(assignment),
  };
};

const buildDescription = ({
  baseDescription,
  notes,
  assignment,
}: {
  baseDescription: string;
  notes?: string | null;
  assignment?: string | null;
}) => {
  const nextDescriptionParts: string[] = [];

  const nextAssignment = assignment?.trim();
  if (nextAssignment) {
    nextDescriptionParts.push(`Assigned to: ${nextAssignment}`);
  }

  const nextBaseDescription = baseDescription.trim();
  if (nextBaseDescription) {
    nextDescriptionParts.push(nextBaseDescription);
  }

  const nextNotes = notes?.trim();
  if (nextNotes) {
    nextDescriptionParts.push(`Owner notes:\n${nextNotes}`);
  }

  return nextDescriptionParts.join('\n\n') || null;
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

    const validStatuses = ['Open', 'In Progress', 'Waiting on Parts', 'Resolved', 'Closed', 'Archived'];
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

    let existingTicket: { description?: string | null; assigned_to?: string | null } | null = null;
    let hasAssignedToColumn = true;

    const { data: fetchedTicket, error: fetchError } = await supabaseAdmin
      .from('tickets')
      .select('description, assigned_to')
      .eq('id', ticketId)
      .maybeSingle();

    if (fetchError) {
      const errorText = String(fetchError.message ?? '');
      if (errorText.toLowerCase().includes('assigned_to') || errorText.toLowerCase().includes('column')) {
        hasAssignedToColumn = false;
      } else {
        throw fetchError;
      }
    } else {
      existingTicket = fetchedTicket ?? null;
    }

    const currentDescription = existingTicket?.description ?? '';
    const parsedDescription = getDescriptionParts(currentDescription);
    const baseDescription = parsedDescription.base;
    const currentNotes = parsedDescription.notes;
    const currentAssignment = parsedDescription.assignment;
    const existingAssignment = typeof existingTicket?.assigned_to === 'string' ? existingTicket.assigned_to.trim() : '';

    const nextAssignment =
      typeof assigned_to === 'string'
        ? assigned_to.trim()
        : existingAssignment || currentAssignment || '';
    const nextNotes =
      typeof notes === 'string' ? notes.trim().replace(/^Owner notes:\s*/i, '').trim() : currentNotes;

    if (typeof assigned_to === 'string' || typeof notes === 'string') {
      if (hasAssignedToColumn && typeof assigned_to === 'string') {
        updates.assigned_to = nextAssignment || null;
      }
      updates.description = buildDescription({
        baseDescription,
        notes: nextNotes,
        assignment: nextAssignment,
      });
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
