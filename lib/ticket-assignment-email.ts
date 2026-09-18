import { Resend } from 'resend';
import crypto from 'node:crypto';

type AssignmentNotificationTicket = {
  id: string;
  title: string;
  priority?: string | null;
  description?: string | null;
  unitPhotoUrl?: string | null;
};

type NotificationResult = {
  sent: boolean;
  recipient: 'tenant' | 'assignee';
  messageId?: string;
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

const getAssigneeName = (assignment?: string | null) => {
  const value = assignment?.trim() ?? '';
  return value.match(/^(.+?)\s*<[^>]+>\s*$/)?.[1]?.trim() || value || 'the maintenance team';
};

const getDescriptionField = (description: string | null | undefined, field: string) =>
  description?.match(new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`, 'i'))?.[1]?.trim() ?? '';

const getEmailConfiguration = () => ({
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.RESEND_FROM_EMAIL,
  replyTo: process.env.RESEND_REPLY_TO_EMAIL,
});

const getNudgeToken = (ticketId: string, assigneeEmail: string) => {
  const secret = process.env.NUDGE_SECRET || process.env.RESEND_API_KEY || '';
  return crypto.createHmac('sha256', secret).update(`${ticketId}:${assigneeEmail.toLowerCase()}`).digest('hex');
};

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
  const assigneeName = getAssigneeName(assignment);
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
    html: `<p>You have been assigned a maintenance ticket.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(fullDetails).replace(/\n/g, '<br />')}</p><p><a href="${ticketUrl}">View ticket</a></p><p>Assigned to: ${escapeHtml(assigneeName)}</p>`,
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
  const assigneeName = getAssigneeName(assignment);
  const nudgeEndpoint = ticketUrl.replace('/dashboard/tickets/', '/api/tickets/') + '/nudge';
  const nudgeUrl = assigneeEmail
    ? `${nudgeEndpoint}?email=${encodeURIComponent(assigneeEmail)}&token=${getNudgeToken(ticket.id, assigneeEmail)}`
    : ticketUrl;
  const photoHtml = ticket.unitPhotoUrl
    ? `<p><img src="${ticket.unitPhotoUrl}" alt="Unit photo" style="max-width:220px;border-radius:10px" /></p>`
    : '';
  const photoText = ticket.unitPhotoUrl ? `\nUnit photo: ${ticket.unitPhotoUrl}` : '';

  if (!apiKey || !from) {
    return {
      results: [
        { sent: false, recipient: 'tenant', reason: 'not-configured' as const },
        { sent: false, recipient: 'assignee', reason: 'not-configured' as const },
      ],
    };
  }

  const resend = new Resend(apiKey);

  if (requesterEmail && assigneeEmail.toLowerCase() === requesterEmail.toLowerCase()) {
    const { data, error } = await resend.emails.send({
      from,
      to: requesterEmail,
      replyTo: replyTo || undefined,
      subject: `Ticket filed and assigned to you: ${ticket.title}`,
      text: `Hello! This is a confirmation that your maintenance request has been received and assigned.\n\n${ticket.title}\n${details}\nAssigned to: ${assigneeName}\n\nYou will get an email update when the status of the request changes.\n\nOpen ticket and add information, adjust severity, or dismiss: ${ticketUrl}\n\nNudge maintenance person: ${nudgeUrl}${photoText}`,
      html: `<p>Hello! This is a confirmation that your maintenance request has been received and assigned.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(details).replace(/\n/g, '<br />')}</p><p><strong>Assigned to:</strong> ${escapeHtml(assigneeName)}</p><p>You will get an email update when the status of the request changes.</p>${photoHtml}<p><a href="${ticketUrl}">Open ticket and add information, adjust severity, or dismiss.</a></p><p><a href="${nudgeUrl}">Nudge maintenance person</a></p>`,
    });
    if (error) throw new Error(`Combined notification failed: ${error.message}`);
    return {
      results: [
        { sent: true, recipient: 'tenant' as const, messageId: data?.id },
        { sent: false, recipient: 'assignee' as const, reason: 'duplicate-recipient' as const },
      ],
    };
  }

  if (requesterEmail) {
    const tenantLinkText = options?.tenantCanViewTicket ? `\n\nView ticket: ${ticketUrl}` : '';
    const tenantLinkHtml = options?.tenantCanViewTicket ? `<p><a href="${ticketUrl}">View ticket</a></p>` : '';
    const { data, error } = await resend.emails.send({
      from,
      to: requesterEmail,
      replyTo: replyTo || undefined,
      subject: `Maintenance request received: ${ticket.title}`,
      text: `Hello! This is a confirmation that your maintenance request has been received and assigned.\n\n${ticket.title}\n${details}\nAssigned to: ${assigneeName}\n\nYou will get an email update when the status of the request changes.\n\nOpen ticket and add information, adjust severity, or dismiss: ${ticketUrl}\n\nNudge maintenance person: ${nudgeUrl}${photoText}`,
      html: `<p>Hello! This is a confirmation that your maintenance request has been received and assigned.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(details).replace(/\n/g, '<br />')}</p><p><strong>Assigned to:</strong> ${escapeHtml(assigneeName)}</p><p>You will get an email update when the status of the request changes.</p>${photoHtml}<p><a href="${ticketUrl}">Open ticket and add information, adjust severity, or dismiss.</a></p><p><a href="${nudgeUrl}">Nudge maintenance person</a></p>${tenantLinkHtml}`,
    });
    if (error) throw new Error(`Tenant email failed: ${error.message}`);
    results.push({ sent: true, recipient: 'tenant', messageId: data?.id });
  } else {
    results.push({ sent: false, recipient: 'tenant', reason: 'missing-recipient' });
  }

  if (!assigneeEmail) {
    results.push({ sent: false, recipient: 'assignee', reason: 'missing-recipient' });
  } else {
    const assigneeDetails = [details, requesterEmail && `Requester: ${requesterEmail}`].filter(Boolean).join('\n');
    const { data, error } = await resend.emails.send({
      from,
      to: assigneeEmail,
      replyTo: replyTo || undefined,
      subject: `Assigned ticket: ${ticket.title}`,
      text: `You have been assigned a maintenance ticket.\n\n${ticket.title}\n${assigneeDetails}\n\nView ticket: ${ticketUrl}`,
      html: `<p>You have been assigned a maintenance ticket.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(assigneeDetails).replace(/\n/g, '<br />')}</p><p><a href="${ticketUrl}">View ticket</a></p>`,
    });
    if (error) throw new Error(`Assignee email failed: ${error.message}`);
    results.push({ sent: true, recipient: 'assignee', messageId: data?.id });
  }

  return { results };
}

export async function sendTicketStatusChangeEmail(
  ticket: AssignmentNotificationTicket,
  assignment: string | null | undefined,
  previousStatus: string,
  newStatus: string,
) {
  const { apiKey, from, replyTo } = getEmailConfiguration();
  const assigneeEmail = getAssigneeEmail(assignment);
  const { details, requesterEmail, ticketUrl } = getTicketDetails(ticket);
  const results: NotificationResult[] = [];

  if (!apiKey || !from) {
    return {
      results: [
        { sent: false, recipient: 'tenant' as const, reason: 'not-configured' as const },
        { sent: false, recipient: 'assignee' as const, reason: 'not-configured' as const },
      ],
    };
  }

  const resend = new Resend(apiKey);
  const subject = `Ticket status updated: ${ticket.title}`;
  const text = `The status of a maintenance ticket has changed.\n\n${ticket.title}\n${details}\nStatus: ${previousStatus} → ${newStatus}\n\nView ticket: ${ticketUrl}`;
  const html = `<p>The status of a maintenance ticket has changed.</p><p><strong>${escapeHtml(ticket.title)}</strong></p><p>${escapeHtml(details).replace(/\n/g, '<br />')}</p><p><strong>Status:</strong> ${escapeHtml(previousStatus)} → ${escapeHtml(newStatus)}</p><p><a href="${ticketUrl}">View ticket</a></p>`;

  const recipients = new Set<string>();
  if (requesterEmail) recipients.add(requesterEmail.toLowerCase());
  if (assigneeEmail) recipients.add(assigneeEmail.toLowerCase());

  if (recipients.size === 0) {
    return {
      results: [
        { sent: false, recipient: 'tenant' as const, reason: 'missing-recipient' as const },
        { sent: false, recipient: 'assignee' as const, reason: 'missing-recipient' as const },
      ],
    };
  }

  for (const email of recipients) {
    const recipientType: 'tenant' | 'assignee' = email === requesterEmail?.toLowerCase() ? 'tenant' : 'assignee';
    const { data, error } = await resend.emails.send({
      from,
      to: email,
      replyTo: replyTo || undefined,
      subject,
      text,
      html,
    });
    if (error) throw new Error(`Status change email failed: ${error.message}`);
    results.push({ sent: true, recipient: recipientType, messageId: data?.id });
  }

  return { results };
}