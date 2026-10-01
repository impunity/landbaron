import { NextRequest, NextResponse } from 'next/server';

import { getAccessibleAnnouncementProperty } from '@/lib/property-announcements';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const reactions = new Set(['up', 'down', 'heart', 'hundred', 'shrug']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ announcementId: string }> }) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const { announcementId } = await params;
    const { reaction } = await request.json();
    if (typeof reaction !== 'string' || !reactions.has(reaction)) {
      return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 });
    }

    const { data: announcement, error: announcementError } = await supabaseAdmin
      .from('property_announcements').select('property_id').eq('id', announcementId).maybeSingle();
    if (announcementError) throw announcementError;
    if (!announcement || !await getAccessibleAnnouncementProperty(announcement.property_id, user)) {
      return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });
    }

    const { data: previous, error: previousError } = await supabaseAdmin
      .from('property_announcement_reactions').select('reaction')
      .eq('announcement_id', announcementId).eq('user_id', user.id).maybeSingle();
    if (previousError) throw previousError;
    if (previous?.reaction === reaction) {
      const { error } = await supabaseAdmin.from('property_announcement_reactions')
        .delete().eq('announcement_id', announcementId).eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('property_announcement_reactions')
        .upsert({ announcement_id: announcementId, user_id: user.id, reaction }, { onConflict: 'announcement_id,user_id' });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST announcement reaction failed:', error);
    return NextResponse.json({ error: 'Reaction could not be saved.' }, { status: 500 });
  }
}