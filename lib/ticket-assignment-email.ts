import { Resend } from 'resend';

type AssignmentNotificationTicket = {
  id: string;
  title: string;
  priority?: string | null;
  description?: string | null;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getAssigneeEmail = (assignment?: string | null) => {
  const match = assignment?.match(/<([^>]+)>/);
  const email = match?.[1]?.trim() ?? assignment?.trim() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const getDescriptionField = (description: string | null | undefined, field: string) =>
  description?.match(new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`, 'i'))?.[1]?.trim() ?? '';

export async function sendTicketAssignmentEmail(
  ticket: AssignmentNotificationTicket,
  assignment?: string | null,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipient = getAssigneeEmail(assignment);

  if (!apiKey || !from || !recipient) {
    return { sent: false, reason: 'not-configured' as const };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://landbaron.vercel.app').replace(/\/$/, '');
  const ticketUrl = `${siteUrl}/dashboard/tickets/${ticket.id}`;
  const requesterEmail = getDescriptionField(ticket.description, 'Email');
  const propertyAddress = getDescriptionField(ticket.description, 'Address');
  const priority = ticket.priority?.trim() || 'Medium';
  const details = [
    `Priority: ${priority}`,
    propertyAddress && `Property: ${propertyAddress}`,
    requesterEmail && `Requester: ${requesterEmail}`,
  ].filter(Boolean).join('\n');

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: recipient,
    subject: `Assigned ticket: ${ticket.title}`,
    text: `You have been assigned a maintenance ticket.\n\n${ticket.title}\n${details}\n\nView ticket: ${ticketUrl}`,
    html: `<p>You have been assigned a maintenance ticket.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(details).replace(/\n/g, '<br />')}</p><p><a href="${ticketUrl}">View ticket</a></p>`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { sent: true as const };
}