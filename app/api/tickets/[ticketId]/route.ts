import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTicketAssignmentEmail, sendTicketStatusChangeEmail } from '@/lib/ticket-assignment-email';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';

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
  request: NextRequest,
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

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    let query = supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', ticketId);

    if (user.role === 'tenant') {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    let propertyLabel: string | null = null;
    let unitLabel: string | null = null;

    if (data.property_id) {
      const { data: property } = await supabaseAdmin
        .from('properties')
        .select('name, address, city, state, postal_code')
        .eq('id', data.property_id)
        .maybeSingle();

      if (property) {
        const location = [property.address, property.city, property.state, property.postal_code].filter(Boolean).join(', ');
        propertyLabel = [property.name, location].filter(Boolean).join(' - ');
      }
    }

    if (data.unit_id) {
      const { data: unit } = await supabaseAdmin
        .from('units')
        .select('unit_number')
        .eq('id', data.unit_id)
        .maybeSingle();

      if (unit?.unit_number) {
        unitLabel = `Unit ${unit.unit_number}`;
      }
    }

    const { data: receipts, error: receiptsError } = await supabaseAdmin
      .from('ticket_receipts')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });

    if (receiptsError) {
      const missingTable = receiptsError.message?.toLowerCase().includes('ticket_receipts');
      if (!missingTable) {
        throw receiptsError;
      }
    }

    return NextResponse.json({ ticket: { ...data, property_label: propertyLabel, unit_label: unitLabel }, receipts: receipts ?? [] });
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
    const { notes, status, assigned_to, labor_cost, materials_cost } = await request.json();

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
      return NextResponse.json({ error: 'Tenants cannot update tickets.' }, { status: 403 });
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

    if (labor_cost !== undefined) {
      const value = labor_cost === null || labor_cost === '' ? null : Number(labor_cost);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return NextResponse.json({ error: 'Labor cost must be zero or greater.' }, { status: 400 });
      }
      updates.labor_cost = value === null ? null : String(value);
    }

    if (materials_cost !== undefined) {
      const value = materials_cost === null || materials_cost === '' ? null : Number(materials_cost);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return NextResponse.json({ error: 'Materials cost must be zero or greater.' }, { status: 400 });
      }
      updates.materials_cost = value === null ? null : String(value);
    }

    let existingTicket: {
      title: string;
      priority?: string | null;
      description?: string | null;
      assigned_to?: string | null;
      status?: string | null;
    } | null = null;
    let hasAssignedToColumn = true;

    const { data: fetchedTicket, error: fetchError } = await supabaseAdmin
      .from('tickets')
      .select('title, priority, description, assigned_to, status')
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

    let notificationError: string | null = null;
    const assignmentChanged =
      typeof assigned_to === 'string' && nextAssignment !== existingAssignment;

    if (assignmentChanged && nextAssignment && existingTicket) {
      try {
        await sendTicketAssignmentEmail({ ...existingTicket, id: ticketId }, nextAssignment);
      } catch (emailError) {
        console.error('Ticket assignment email failed:', emailError);
        notificationError = 'Ticket updated, but the assignment email could not be sent.';
      }
    }

    const previousStatus = existingTicket?.status ?? '';
    const statusChanged =
      typeof updates.status === 'string' && updates.status !== previousStatus;

    if (statusChanged && existingTicket) {
      try {
        await sendTicketStatusChangeEmail(
          { ...existingTicket, id: ticketId },
          nextAssignment,
          previousStatus || 'Open',
          updates.status as string,
        );
      } catch (emailError) {
        console.error('Ticket status change email failed:', emailError);
        notificationError = 'Ticket updated, but the status change email could not be sent.';
      }
    }

    return NextResponse.json({ ok: true, notificationError });
  } catch (error) {
    console.error('PATCH /api/tickets/[ticketId] failed:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Ticket update failed. Please try again.',
      },
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
      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .select('created_by')
        .eq('id', ticketId)
        .maybeSingle();

      if (ticketError) {
        throw ticketError;
      }

      if (!ticket || ticket.created_by !== user.id) {
        return NextResponse.json({ error: 'You can only delete tickets you created.' }, { status: 403 });
      }
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
