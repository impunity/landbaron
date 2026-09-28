import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { emailAnnouncement, getAccessibleAnnouncementProperty, getAnnouncementAuthor } from '@/lib/property-announcements';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ announcementId: string }> },
) {
  try {
    const { announcementId } = await params;
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const body = String((await request.json().catch(() => ({})))?.body ?? '').trim();
    if (!body) return NextResponse.json({ error: 'Write a reply before submitting.' }, { status: 400 });
    if (body.length > 5000) return NextResponse.json({ error: 'Replies must be 5,000 characters or fewer.' }, { status: 400 });

    const { data: announcement, error: announcementError } = await supabaseAdmin
      .from('property_announcements')
      .select('id, property_id, body, author_name')
      .eq('id', announcementId)
      .maybeSingle();
    if (announcementError) throw announcementError;
    if (!announcement) return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });

    const property = await getAccessibleAnnouncementProperty(announcement.property_id, user);
    if (!property) return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });
    const authorName = await getAnnouncementAuthor(user);
    const { data: reply, error: replyError } = await supabaseAdmin
      .from('property_announcement_replies')
      .insert({ announcement_id: announcementId, author_user_id: user.id, author_name: authorName, author_email: user.email, body })
      .select()
      .single();
    if (replyError) throw replyError;

    let notifications;
    try {
      notifications = await emailAnnouncement(property, {
        id: announcement.id,
        title: announcement.body.slice(0, 80),
        body,
        author_name: authorName,
      }, 'reply');
    } catch (emailError) {
      console.error('Reply was saved but email notifications failed:', emailError);
      notifications = { attempted: 0, sent: 0, failed: -1 };
    }
    return NextResponse.json({ ok: true, reply, notifications });
  } catch (error) {
    console.error('POST announcement reply failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Reply could not be submitted.' }, { status: 500 });
  }
}
