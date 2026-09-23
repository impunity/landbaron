import { Resend } from 'resend';

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export async function sendAccessRequestEmail(details: {
  ownerEmail: string;
  organizationName: string;
  requestId: string;
  token: string;
  requestedRole: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('Email is not configured.');
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://landbaron.app').replace(/\/$/, '');
  const approvalUrl = `${siteUrl}/dashboard/access-requests/${details.token}`;
  const text = [
    `A new access request was submitted for ${details.organizationName}.`,
    '',
    `Name: ${details.name}`,
    `Email: ${details.email}`,
    `Phone: ${details.phone}`,
    `Address: ${details.address}`,
    `Requested role: ${details.requestedRole}`,
    '',
    `Review and accept or decline: ${approvalUrl}`,
  ].join('\n');

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: details.ownerEmail,
    replyTo: details.email,
    subject: `Access request for ${details.organizationName}: ${details.name}`,
    text,
    html: `<p>A new access request was submitted for <strong>${escapeHtml(details.organizationName)}</strong>.</p><p><strong>Name:</strong> ${escapeHtml(details.name)}<br /><strong>Email:</strong> ${escapeHtml(details.email)}<br /><strong>Phone:</strong> ${escapeHtml(details.phone)}<br /><strong>Address:</strong> ${escapeHtml(details.address)}<br /><strong>Requested role:</strong> ${escapeHtml(details.requestedRole)}</p><p><a href="${approvalUrl}">Review and accept or decline this request</a></p>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}
