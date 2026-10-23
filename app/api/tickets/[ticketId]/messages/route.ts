import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canAccessTicket } from '@/lib/ticket-access';
import { getTicketCreatorLabels } from '@/lib/ticket-creators';
import { getTicketConversationError } from '@/lib/ticket-conversation-errors';

export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const { ticketId } = await params;
    if (!(await canAccessTicket(user, ticketId))) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    const payload = await request.json();
    if (typeof payload.body !== 'string' || !payload.body.trim() || payload.body.trim().length > 5000) {
      return NextResponse.json({ error: 'Messages must contain between 1 and 5,000 characters.' }, { status: 400 });
    }
    const parentId = payload.parent_id ?? null;
    if (parentId !== null) {
      if (typeof parentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId)) {
        return NextResponse.json({ error: 'Invalid reply target.' }, { status: 400 });
      }
      const { data: parent, error } = await supabaseAdmin.from('ticket_messages')
        .select('id').eq('ticket_id', ticketId).eq('id', parentId).maybeSingle();
      if (error) throw error;
      if (!parent) return NextResponse.json({ error: 'Reply target not found in this ticket.' }, { status: 400 });
    }
    const authorName = (await getTicketCreatorLabels([user.id])).get(user.id) ?? user.email;
    const { data: message, error } = await supabaseAdmin.from('ticket_messages')
      .insert({ ticket_id: ticketId, parent_id: parentId, author_user_id: user.id, author_name: authorName, body: payload.body.trim() })
      .select().single();
    if (error) throw error;
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('POST ticket message failed:', error);
    return NextResponse.json({ error: getTicketConversationError(error, 'save') }, { status: 500 });
  }
}
