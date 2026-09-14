import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const formData = await request.formData();
    const file = formData.get('file');

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

    if (user.role === 'tenant') {
      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .select('created_by')
        .eq('id', ticketId)
        .maybeSingle();

      if (ticketError) {
        throw ticketError;
      }

      if (!ticket || ticket.created_by !== user.id) {
        return NextResponse.json({ error: 'You can only update your own tickets.' }, { status: 403 });
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No photo was uploaded.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Photo must be 8MB or smaller.' }, { status: 400 });
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'png';
    const fileName = `ticket-attachments/${ticketId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('ticket-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('ticket-photos')
      .getPublicUrl(uploadData.path);

    const publicUrl = publicUrlData.publicUrl;

    const { data: existingTicket, error: fetchError } = await supabaseAdmin
      .from('tickets')
      .select('description')
      .eq('id', ticketId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    const existingDescription = existingTicket?.description ?? '';
    const photoLabel = file.name.trim() || 'photo';
    const nextDescription = existingDescription.trim()
      ? `${existingDescription.trim()}\n\nPhoto: ${photoLabel} | ${publicUrl}`
      : `Photo: ${photoLabel} | ${publicUrl}`;

    const { error: updateError } = await supabaseAdmin
      .from('tickets')
      .update({ description: nextDescription })
      .eq('id', ticketId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (error) {
    console.error('POST /api/tickets/[ticketId]/photos failed:', error);
    return NextResponse.json(
      { error: 'Photo upload failed. Please confirm the ticket-photos bucket exists in Supabase Storage.' },
      { status: 500 },
    );
  }
}
