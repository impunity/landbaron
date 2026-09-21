import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTicketCreatedEmails } from '@/lib/ticket-assignment-email';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';

const parseReporterEmailFromDescription = (description?: string | null) => {
  if (!description) {
    return '';
  }

  const reporterMatch = description.match(/(?:^|\n)Email:\s*([^\n]+)/i);
  return reporterMatch?.[1]?.trim().toLowerCase() ?? '';
};

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

    const tickets = data ?? [];
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('name,email,unit_id');

    const tenantByEmail = new Map<string, string>();
    const tenantsByUnit = new Map<string, Array<{ name: string }>>();
    (tenants ?? []).forEach((tenant) => {
      const name = typeof tenant.name === 'string' ? tenant.name.trim() : '';
      const email = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      const unitId = typeof tenant.unit_id === 'string' ? tenant.unit_id : '';

      if (name && email) {
        tenantByEmail.set(email, name);
      }

      if (name && unitId) {
        tenantsByUnit.set(unitId, [...(tenantsByUnit.get(unitId) ?? []), { name }]);
      }
    });

    const ticketsWithReporterNames = tickets.map((ticket) => {
      const reporterEmail = parseReporterEmailFromDescription(ticket.description);
      const unitTenants = ticket.unit_id ? tenantsByUnit.get(ticket.unit_id) ?? [] : [];
      const openedByLabel = reporterEmail
        ? tenantByEmail.get(reporterEmail) ?? 'Unknown'
        : unitTenants.length === 1
          ? unitTenants[0].name
          : 'Unknown';

      return { ...ticket, opened_by_label: openedByLabel };
    });

    return NextResponse.json({
      tickets: ticketsWithReporterNames,
      count: tickets.length,
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
    const { title, description, status, priority, assigned_to, property_id, unit_id } = await request.json();

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
          property_id: typeof property_id === 'string' && property_id.trim() ? property_id.trim() : null,
          unit_id: typeof unit_id === 'string' && unit_id.trim() ? unit_id.trim() : null,
        },
      ])
      .select('id, ticket_number, title, priority, description, unit_id')
      .single();

    if (error) {
      throw error;
    }

    const { data: unitPhoto } = ticket.unit_id
      ? await supabaseAdmin.from('unit_photos').select('photo_url').eq('unit_id', ticket.unit_id).order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    const notificationTicket = { ...ticket, unitPhotoUrl: unitPhoto?.photo_url ?? null };

    let notificationError: string | null = null;
    let notificationSent = false;
    if (ticket) {
      try {
        const notification = await sendTicketCreatedEmails(notificationTicket, normalizedAssignee, {
          tenantCanViewTicket: user.role === 'tenant',
        });
        const notConfigured = notification.results.every((result) => result.reason === 'not-configured');
        if (notConfigured) {
          notificationError = 'Email notifications are not configured yet.';
        }
        notificationSent = notification.results.some((result) => result.sent);
      } catch (emailError) {
        console.error('Ticket creation emails failed:', emailError);
        const emailMessage = emailError instanceof Error ? emailError.message : '';
        notificationError = emailMessage
          ? `Email notification failed: ${emailMessage}`
          : 'One or more notification emails could not be sent.';
      }
    }

    return NextResponse.json({ ok: true, ticket, notificationError, notificationSent });
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
