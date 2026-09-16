import { Resend } from 'resend';

type AssignmentNotificationTicket = {
  id: string;
  title: string;
  priority?: string | null;
  description?: string | null;
};

type NotificationResult = {
  sent: boolean;
  recipient: 'tenant' | 'assignee';
  reason?: 'not-configured' | 'missing-recipient' | 'duplicate-recipient';
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

const getEmailConfiguration = () => ({
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.RESEND_FROM_EMAIL,
  replyTo: process.env.RESEND_REPLY_TO_EMAIL,
});

const getTicketDetails = (ticket: AssignmentNotificationTicket) => {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://landbaron.vercel.app').replace(/\/$/, '');
  const requesterEmail = getDescriptionField(ticket.description, 'Email');
  const propertyAddress = getDescriptionField(ticket.description, 'Address');
  const priority = ticket.priority?.trim() || 'Medium';
  const details = [
    `Priority: ${priority}`,
    propertyAddress && `Property: ${propertyAddress}`,
  ].filter(Boolean).join('\n');

  return {
    details,
    propertyAddress,
    priority,
    requesterEmail,
    ticketUrl: `${siteUrl}/dashboard/tickets/${ticket.id}`,
  };
};

export async function sendTicketAssignmentEmail(
  ticket: AssignmentNotificationTicket,
  assignment?: string | null,
) {
  const { apiKey, from, replyTo } = getEmailConfiguration();
  const recipient = getAssigneeEmail(assignment);

  if (!apiKey || !from || !recipient) {
    return { sent: false, reason: 'not-configured' as const };
  }

  const { details, requesterEmail, ticketUrl } = getTicketDetails(ticket);
  const requesterDetails = [
    requesterEmail && `Requester: ${requesterEmail}`,
  ].filter(Boolean).join('\n');
  const fullDetails = [details, requesterDetails].filter(Boolean).join('\n');

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: recipient,
    replyTo: replyTo || undefined,
    subject: `Assigned ticket: ${ticket.title}`,
    text: `You have been assigned a maintenance ticket.\n\n${ticket.title}\n${fullDetails}\n\nView ticket: ${ticketUrl}`,
    html: `<p>You have been assigned a maintenance ticket.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(fullDetails).replace(/\n/g, '<br />')}</p><p><a href="${ticketUrl}">View ticket</a></p>`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { sent: true as const };
}

export async function sendTicketCreatedEmails(
  ticket: AssignmentNotificationTicket,
  assignment?: string | null,
  options?: { tenantCanViewTicket?: boolean },
) {
  const { apiKey, from, replyTo } = getEmailConfiguration();
  const assigneeEmail = getAssigneeEmail(assignment);
  const { details, requesterEmail, ticketUrl } = getTicketDetails(ticket);
  const results: NotificationResult[] = [];

  if (!apiKey || !from) {
    return {
      results: [
        { sent: false, recipient: 'tenant', reason: 'not-configured' as const },
        { sent: false, recipient: 'assignee', reason: 'not-configured' as const },
      ],
    };
  }

  const resend = new Resend(apiKey);

  if (requesterEmail) {
    const tenantLinkText = options?.tenantCanViewTicket ? `\n\nView ticket: ${ticketUrl}` : '';
    const tenantLinkHtml = options?.tenantCanViewTicket ? `<p><a href="${ticketUrl}">View ticket</a></p>` : '';
    const { error } = await resend.emails.send({
      from,
      to: requesterEmail,
      replyTo: replyTo || undefined,
      subject: `Maintenance request received: ${ticket.title}`,
      text: `Your maintenance request has been received.\n\n${ticket.title}\n${details}${tenantLinkText}`,
      html: `<p>Your maintenance request has been received.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(details).replace(/\n/g, '<br />')}</p>${tenantLinkHtml}`,
    });
    if (error) throw new Error(`Tenant email failed: ${error.message}`);
    results.push({ sent: true, recipient: 'tenant' });
  } else {
    results.push({ sent: false, recipient: 'tenant', reason: 'missing-recipient' });
  }

  if (!assigneeEmail) {
    results.push({ sent: false, recipient: 'assignee', reason: 'missing-recipient' });
  } else if (assigneeEmail.toLowerCase() === requesterEmail.toLowerCase()) {
    results.push({ sent: false, recipient: 'assignee', reason: 'duplicate-recipient' });
  } else {
    const assigneeDetails = [details, requesterEmail && `Requester: ${requesterEmail}`].filter(Boolean).join('\n');
    const { error } = await resend.emails.send({
      from,
      to: assigneeEmail,
      replyTo: replyTo || undefined,
      subject: `Assigned ticket: ${ticket.title}`,
      text: `You have been assigned a maintenance ticket.\n\n${ticket.title}\n${assigneeDetails}\n\nView ticket: ${ticketUrl}`,
      html: `<p>You have been assigned a maintenance ticket.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(assigneeDetails).replace(/\n/g, '<br />')}</p><p><a href="${ticketUrl}">View ticket</a></p>`,
    });
    if (error) throw new Error(`Assignee email failed: ${error.message}`);
    results.push({ sent: true, recipient: 'assignee' });
  }

  return { results };
}