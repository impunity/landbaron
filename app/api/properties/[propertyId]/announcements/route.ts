import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { isHeicImage, prepareImageUpload } from '@/lib/image-upload';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { emailAnnouncement, getAccessibleAnnouncementProperty, getAnnouncementAuthor } from '@/lib/property-announcements';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TOTAL_SIZE = 4 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await params;
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const property = await getAccessibleAnnouncementProperty(propertyId, user);
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

    const readThrough = new Date().toISOString();
    const { data: announcements, error } = await supabaseAdmin
      .from('property_announcements')
      .select('*, property_announcement_replies(*)')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const announcementIds = (announcements ?? []).map((item) => item.id);
    const { data: reactions, error: reactionsError } = announcementIds.length
      ? await supabaseAdmin.from('property_announcement_reactions')
        .select('announcement_id, user_id, reaction').in('announcement_id', announcementIds)
      : { data: [], error: null };
    if (reactionsError) throw reactionsError;

    const ordered = (announcements ?? []).map((announcement) => ({
      ...announcement,
      reactions: (reactions ?? []).filter((item) => item.announcement_id === announcement.id).reduce((counts: Record<string, number>, item) => {
        counts[item.reaction] = (counts[item.reaction] ?? 0) + 1;
        return counts;
      }, {}),
      my_reaction: (reactions ?? []).find((item) => item.announcement_id === announcement.id && item.user_id === user.id)?.reaction ?? null,
      property_announcement_replies: [...(announcement.property_announcement_replies ?? [])]
        .sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime()),
    }));
    return NextResponse.json({ property, announcements: ordered, readThrough });
  } catch (error) {
    console.error('GET property announcements failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Announcements could not be loaded.') }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  let uploadedPaths: string[] = [];
  let bucket = '';
  let announcementId = '';
  try {
    const { propertyId } = await params;
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const property = await getAccessibleAnnouncementProperty(propertyId, user);
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

    const formData = await request.formData();
    const body = String(formData.get('body') ?? '').trim();
    const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (!body) return NextResponse.json({ error: 'Write a message before submitting.' }, { status: 400 });
    if (body.length > 10000) return NextResponse.json({ error: 'Announcements must be 10,000 characters or fewer.' }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Attach up to ${MAX_FILES} images.` }, { status: 400 });
    if (files.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type) && !isHeicImage(file))) return NextResponse.json({ error: 'Use JPG, PNG, WEBP, GIF, or HEIC images.' }, { status: 400 });
    if (files.some((file) => file.size > (isHeicImage(file) ? 20 * 1024 * 1024 : MAX_FILE_SIZE))) {
      return NextResponse.json({ error: 'Images must be 4 MB or less (20 MB for HEIC).' }, { status: 400 });
    }
    const images = await Promise.all(files.map(async (file) => prepareImageUpload(file)));
    if (images.some((image) => image.size > MAX_FILE_SIZE) || images.reduce((total, image) => total + image.size, 0) > MAX_TOTAL_SIZE) {
      return NextResponse.json({ error: 'Attached images must total 4 MB or less.' }, { status: 400 });
    }

    const authorName = await getAnnouncementAuthor(user);
    const { data: announcement, error: insertError } = await supabaseAdmin
      .from('property_announcements')
      .insert({ property_id: propertyId, author_user_id: user.id, author_name: authorName, author_email: user.email, body, image_urls: [] })
      .select()
      .single();
    if (insertError) throw insertError;
    announcementId = announcement.id;

    const imageUrls: string[] = [];
    if (files.length > 0) {
      bucket = 'property-announcements';
      for (const image of images) {
        const path = `${propertyId}/${announcementId}/${crypto.randomUUID()}.${image.name.split('.').pop()?.toLowerCase() || 'jpg'}`;
        const { data: upload, error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, image, { cacheControl: '3600', upsert: false, contentType: image.type });
        if (uploadError) throw uploadError;
        uploadedPaths.push(upload.path);
        const { data: publicUrl } = supabaseAdmin.storage.from(bucket).getPublicUrl(upload.path);
        imageUrls.push(publicUrl.publicUrl);
      }
      const { error: updateError } = await supabaseAdmin.from('property_announcements').update({ image_urls: imageUrls }).eq('id', announcementId);
      if (updateError) throw updateError;
    }

    let notifications;
    try {
      notifications = await emailAnnouncement(property, { ...announcement, body, author_name: authorName, image_urls: imageUrls }, 'post');
    } catch (emailError) {
      console.error('Announcement was saved but email notifications failed:', emailError);
      notifications = { error: true };
    }
    return NextResponse.json({ ok: true, announcement: { ...announcement, body, author_name: authorName, image_urls: imageUrls }, notifications });
  } catch (error) {
    if (supabaseAdmin && uploadedPaths.length && bucket) await supabaseAdmin.storage.from(bucket).remove(uploadedPaths);
    if (supabaseAdmin && announcementId) await supabaseAdmin.from('property_announcements').delete().eq('id', announcementId);
    console.error('POST property announcement failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Announcement could not be submitted.') }, { status: 500 });
  }
}
