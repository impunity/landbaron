import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAccessibleAnnouncementProperty } from '@/lib/property-announcements';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function getAccessiblePropertyIds(user: Awaited<ReturnType<typeof getAuthenticatedRequestUser>>) {
  if (!user || !supabaseAdmin) return [];
  if (user.role === 'tenant') {
    const { data, error } = await supabaseAdmin.from('tenants').select('units(property_id)').ilike('email', user.email).eq('status', 'active');
    if (error) throw error;
    const propertyIds = (data ?? []).flatMap((tenant) => {
      const units = Array.isArray(tenant.units) ? tenant.units : tenant.units ? [tenant.units] : [];
      return units.map((unit) => unit.property_id).filter((id): id is string => typeof id === 'string');
    });
    return Array.from(new Set(propertyIds));
  }
  const organizationId = await getRequestOrganizationId(user);
  if (!organizationId) return [];
  const { data, error } = await supabaseAdmin.from('properties').select('id').eq('organization_id', organizationId);
  if (error) throw error;
  return (data ?? []).map((property) => property.id as string);
}

function isMissingReceiptTable(error: { code?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const propertyIds = await getAccessiblePropertyIds(user);
    if (!propertyIds.length) return NextResponse.json({ count: 0 });

    const { data: announcements, error: announcementError } = await supabaseAdmin.from('property_announcements')
      .select('id, property_id, author_user_id, created_at').in('property_id', propertyIds);
    if (announcementError) throw announcementError;
    const announcementIds = (announcements ?? []).map((announcement) => announcement.id as string);
    if (!announcementIds.length) return NextResponse.json({ count: 0 });

    const [repliesResult, readsResult] = await Promise.all([
      supabaseAdmin.from('property_announcement_replies').select('announcement_id, author_user_id, created_at').in('announcement_id', announcementIds),
      supabaseAdmin.from('property_announcement_reads').select('announcement_id, read_at').eq('user_id', user.id).in('announcement_id', announcementIds),
    ]);
    if (repliesResult.error) throw repliesResult.error;
    if (readsResult.error) {
      if (isMissingReceiptTable(readsResult.error)) return NextResponse.json({ count: 0, setupRequired: true });
      throw readsResult.error;
    }

    const lastReadByAnnouncement = new Map((readsResult.data ?? []).map((read) => [read.announcement_id, Date.parse(read.read_at)]));
    const hasUnread = new Set<string>();
    const unreadPropertyIds = new Set<string>();
    const propertyByAnnouncement = new Map((announcements ?? []).map((announcement) => [announcement.id, announcement.property_id]));
    for (const announcement of announcements ?? []) {
      if (announcement.author_user_id !== user.id) {
        const readAt = lastReadByAnnouncement.get(announcement.id) ?? 0;
        if (Date.parse(announcement.created_at) > readAt) {
          hasUnread.add(announcement.id);
          unreadPropertyIds.add(announcement.property_id);
        }
      }
    }
    for (const reply of repliesResult.data ?? []) {
      if (reply.author_user_id !== user.id) {
        const readAt = lastReadByAnnouncement.get(reply.announcement_id) ?? 0;
        if (Date.parse(reply.created_at) > readAt) {
          hasUnread.add(reply.announcement_id);
          const propertyId = propertyByAnnouncement.get(reply.announcement_id);
          if (propertyId) unreadPropertyIds.add(propertyId);
        }
      }
    }
    return NextResponse.json({ count: hasUnread.size, propertyId: unreadPropertyIds.values().next().value ?? null });
  } catch (error) {
    console.error('GET unread announcements failed:', error);
    return NextResponse.json({ error: 'Unread discussions could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    const readAt = typeof body.readAt === 'string' ? body.readAt : '';
    const parsedReadAt = Date.parse(readAt);
    if (!propertyId || !Number.isFinite(parsedReadAt) || parsedReadAt > Date.now()) {
      return NextResponse.json({ error: 'A property and valid read timestamp are required.' }, { status: 400 });
    }
    const property = await getAccessibleAnnouncementProperty(propertyId, user);
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    const { data: announcements, error: announcementError } = await supabaseAdmin.from('property_announcements')
      .select('id').eq('property_id', propertyId).lte('created_at', readAt);
    if (announcementError) throw announcementError;
    const receipts = (announcements ?? []).map((announcement) => ({ user_id: user.id, announcement_id: announcement.id, read_at: new Date(parsedReadAt).toISOString() }));
    for (let offset = 0; offset < receipts.length; offset += 500) {
      const { error } = await supabaseAdmin.from('property_announcement_reads').upsert(receipts.slice(offset, offset + 500), { onConflict: 'user_id,announcement_id' });
      if (error) {
        if (isMissingReceiptTable(error)) return NextResponse.json({ error: 'Apply supabase/announcement-read-receipts.sql to enable unread badges.' }, { status: 503 });
        throw error;
      }
    }
    return NextResponse.json({ markedRead: receipts.length });
  } catch (error) {
    console.error('POST announcement reads failed:', error);
    return NextResponse.json({ error: 'Discussions could not be marked as read.' }, { status: 500 });
  }
}
