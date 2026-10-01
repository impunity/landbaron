import { NextRequest, NextResponse } from 'next/server';

import { getAnnouncementMentionCandidates } from '@/lib/announcement-mentions';
import { getAccessibleAnnouncementProperty } from '@/lib/property-announcements';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const { propertyId } = await params;
    const property = await getAccessibleAnnouncementProperty(propertyId, user);
    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

    return NextResponse.json({ people: await getAnnouncementMentionCandidates(property.id, property.organization_id) });
  } catch (error) {
    console.error('GET announcement mentions failed:', error);
    return NextResponse.json({ error: 'People could not be loaded.' }, { status: 500 });
  }
}