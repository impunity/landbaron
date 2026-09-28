import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { getAccessibleAnnouncementProperty } from '@/lib/property-announcements';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ announcementId: string }> },
) {
  try {
    const { announcementId } = await params;
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'maintenance') {
      return NextResponse.json({ error: 'Only the owner or maintenance staff can delete announcements.' }, { status: 403 });
    }

    const { data: announcement, error: fetchError } = await supabaseAdmin
      .from('property_announcements')
      .select('id, property_id, image_urls')
      .eq('id', announcementId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!announcement) return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });

    const property = await getAccessibleAnnouncementProperty(announcement.property_id, user);
    if (!property) return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });
    const { error } = await supabaseAdmin.from('property_announcements').delete().eq('id', announcementId);
    if (error) throw error;
    const imagePaths = (announcement.image_urls ?? []).flatMap((imageUrl: string) => {
      try {
        const marker = '/storage/v1/object/public/property-announcements/';
        const path = new URL(imageUrl).pathname.split(marker)[1];
        return path ? [decodeURIComponent(path)] : [];
      } catch {
        return [];
      }
    });
    if (imagePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage.from('property-announcements').remove(imagePaths);
      if (storageError) console.error('Announcement images could not be removed:', storageError);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE announcement failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Announcement could not be deleted.' }, { status: 500 });
  }
}
