import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTicketAssignmentEmail } from '@/lib/ticket-assignment-email';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';

export async function GET(request: NextRequest) {
  try {
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
      .order('updated_at', { ascending: false });

    if (user.role === 'tenant') {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      tickets: data ?? [],
      count: data?.length ?? 0,
    });
  } catch (error) {
    console.error('GET /api/tickets failed:', error);
    return NextResponse.json(
      { error: 'Unable to load tickets right now.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, description, status, priority, assigned_to } = await request.json();

    if (!title || !description || !status || !priority) {
      return NextResponse.json(
        { error: 'Title, description, status, and priority are required.' },
        { status: 400 },
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            'Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and reopen the app.',
        },
        { status: 500 },
      );
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const normalizedAssignee = user.role === 'tenant' ? '' : typeof assigned_to === 'string' ? assigned_to.trim() : '';
    const reporterEmail = user.role === 'tenant' ? user.email : '';
    const normalizedDescription = reporterEmail
      ? description.replace(/(^|\n)Email:\s*[^\n]*/i, `$1Email: ${reporterEmail}`)
      : description;

    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .insert([
        {
          title,
          description: normalizedDescription,
          status,
          priority,
          assigned_to: normalizedAssignee || null,
          created_by: user.id,
        },
      ])
      .select('id, title, priority, description')
      .single();

    if (error) {
      throw error;
    }

    let notificationError: string | null = null;
    if (normalizedAssignee && ticket) {
      try {
        await sendTicketAssignmentEmail(ticket, normalizedAssignee);
      } catch (emailError) {
        console.error('Ticket assignment email failed:', emailError);
        notificationError = 'Ticket created, but the assignment email could not be sent.';
      }
    }

    return NextResponse.json({ ok: true, notificationError });
  } catch (error) {
    console.error('POST /api/tickets failed:', error);
    return NextResponse.json(
      {
        error:
          'Ticket could not be submitted. This usually means the tickets table has an RLS policy or a schema constraint that still needs to be updated in Supabase.',
      },
      { status: 500 },
    );
  }
}
