import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { getRequestOrganizationId } from '@/lib/organization-context';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildTicketLeaderboard, type ResolutionTicket } from '@/lib/ticket-leaderboard';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ error: 'No organization was found for this account.' }, { status: 403 });
    const tickets: ResolutionTicket[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await supabaseAdmin.from('tickets')
        .select('status, created_at, resolved_at, resolved_by, resolved_by_name')
        .eq('organization_id', organizationId).order('id').range(start, start + 499);
      if (error) throw error;
      tickets.push(...data);
      if (data.length < 500) break;
    }
    return NextResponse.json(buildTicketLeaderboard(tickets));
  } catch (error) {
    console.error('GET ticket leaderboard failed:', error);
    return NextResponse.json({ error: 'Leaderboard could not be loaded. Verify supabase/ticket-conversations-and-resolvers.sql has been applied.' }, { status: 500 });
  }
}
