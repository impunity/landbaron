import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTicketCreatedEmails } from '@/lib/ticket-assignment-email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .select('id, title, priority, description, assigned_to, unit_id, created_by')
      .eq('id', ticketId)
      .maybeSingle();

    if (error) throw error;
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });

    if (user.role === 'tenant' && ticket.created_by !== user.id) {
      return NextResponse.json({ error: 'You can only remind maintenance about your own tickets.' }, { status: 403 });
    }

    const { data: unitPhoto } = ticket.unit_id
      ? await supabaseAdmin
        .from('unit_photos')
        .select('photo_url')
        .eq('unit_id', ticket.unit_id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null };

    const reminder = await sendTicketCreatedEmails(
      { ...ticket, unitPhotoUrl: unitPhoto?.photo_url ?? null },
      ticket.assigned_to,
      { tenantCanViewTicket: true, tenantSubjectPrefix: 'REMINDER SENT RE ' },
    );

    const sent = reminder.results.some((result) => result.sent);
    const notConfigured = reminder.results.every((result) => result.reason === 'not-configured');

    return NextResponse.json({
      ok: true,
      sent,
      notificationError: notConfigured ? 'Email notifications are not configured yet.' : null,
      results: reminder.results,
    });
  } catch (error) {
    console.error('POST /api/tickets/[ticketId]/remind failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reminder email could not be sent.' },
      { status: 500 },
    );
  }
}
