import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase-admin';

const getToken = (ticketId: string, email: string) => {
  const secret = process.env.NUDGE_SECRET || process.env.RESEND_API_KEY || '';
  return crypto.createHmac('sha256', secret).update(`${ticketId}:${email.toLowerCase()}`).digest('hex');
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await params;
    if (!supabaseAdmin) return NextResponse.json({ error: 'Email service is not configured.' }, { status: 500 });
    const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase() || '';
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!email || token !== getToken(ticketId, email)) {
      return NextResponse.json({ error: 'Invalid reminder link.' }, { status: 403 });
    }

    const { data: ticket } = await supabaseAdmin.from('tickets').select('id,title,priority,description,assigned_to').eq('id', ticketId).maybeSingle();
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    const from = process.env.RESEND_FROM_EMAIL;
    const replyTo = process.env.RESEND_REPLY_TO_EMAIL;
    if (!process.env.RESEND_API_KEY || !from) return NextResponse.json({ error: 'Email service is not configured.' }, { status: 500 });

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://landbaron.app').replace(/\/$/, '');
    const details = [`Priority: ${ticket.priority || 'Medium'}`, ticket.description?.match(/(?:^|\n)Address:\s*([^\n]+)/i)?.[1]].filter(Boolean).join('\n');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to: email,
      replyTo: replyTo || undefined,
      subject: `Reminder: maintenance ticket needs attention - ${ticket.title}`,
      text: `A tenant requested an update on this maintenance ticket.\n\n${ticket.title}\n${details}\n\nOpen ticket: ${siteUrl}/dashboard/tickets/${ticket.id}`,
      html: `<p>A tenant requested an update on this maintenance ticket.</p><p><strong>${ticket.title}</strong></p><p>${details.replace(/\n/g, '<br />')}</p><p><a href="${siteUrl}/dashboard/tickets/${ticket.id}">Open ticket</a></p>`,
    });
    if (error) throw new Error(error.message);
    return NextResponse.redirect(new URL(`/dashboard/tickets/${ticketId}?nudge=sent`, request.url));
  } catch (error) {
    console.error('GET /api/tickets/[ticketId]/nudge failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Reminder email failed.' }, { status: 500 });
  }
}