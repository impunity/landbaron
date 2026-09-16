import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Only staff can upload receipts.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No receipt was uploaded.' }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Receipts must be PDF, JPG, PNG, or WEBP.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Receipt must be 10MB or smaller.' }, { status: 400 });
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const path = `ticket-receipts/${ticketId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage
      .from('ticket-receipts')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabaseAdmin.storage.from('ticket-receipts').getPublicUrl(upload.path);
    const { data: receipt, error } = await supabaseAdmin
      .from('ticket_receipts')
      .insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_url: publicUrl.publicUrl,
        file_type: file.type,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    console.error('POST /api/tickets/[ticketId]/receipts failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Receipt upload failed.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Only staff can delete receipts.' }, { status: 403 });
    }

    const receiptId = new URL(request.url).searchParams.get('receiptId');
    if (!receiptId) return NextResponse.json({ error: 'Receipt ID is required.' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('ticket_receipts')
      .delete()
      .eq('id', receiptId)
      .eq('ticket_id', ticketId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/tickets/[ticketId]/receipts failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Receipt deletion failed.' },
      { status: 500 },
    );
  }
}