import { Resend } from 'resend';

import type { AuthenticatedRequestUser } from '@/lib/request-auth';
import { getRequestOrganizationId } from '@/lib/organization-context';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type AnnouncementProperty = {
  id: string;
  name: string;
  address: string;
  organization_id: string | null;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export async function getAccessibleAnnouncementProperty(propertyId: string, user: AuthenticatedRequestUser) {
  if (!supabaseAdmin) throw new Error('Supabase service role is not configured.');

  const { data: property, error } = await supabaseAdmin
    .from('properties')
    .select('id, name, address, organization_id')
    .eq('id', propertyId)
    .maybeSingle();

  if (error) throw error;
  if (!property) return null;

  if (user.role === 'tenant') {
    const { data: tenantRows, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('unit_id')
      .ilike('email', user.email)
      .eq('status', 'active');

    if (tenantError) throw tenantError;
    const unitIds = (tenantRows ?? []).map((tenant) => tenant.unit_id).filter(Boolean);
    if (unitIds.length === 0) return null;

    const { data: units, error: unitError } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('property_id', propertyId)
      .in('id', unitIds);

    if (unitError) throw unitError;
    return units?.length ? property as AnnouncementProperty : null;
  }

  const organizationId = await getRequestOrganizationId(user);
  if (!organizationId || property.organization_id !== organizationId) return null;
  return property as AnnouncementProperty;
}

export async function getAnnouncementAuthor(user: AuthenticatedRequestUser) {
  if (!supabaseAdmin) throw new Error('Supabase service role is not configured.');

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('name')
    .ilike('email', user.email)
    .limit(1)
    .maybeSingle();
  if (staff?.name) return String(staff.name);

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .ilike('email', user.email)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return String(tenant?.name || user.email.split('@')[0] || user.email);
}

export async function emailAnnouncement(
  property: AnnouncementProperty,
  announcement: { id: string; body: string; author_name: string; image_urls?: string[]; title?: string },
  kind: 'post' | 'reply',
) {
  if (!supabaseAdmin) throw new Error('Supabase service role is not configured.');
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Email notifications are not configured.');

  const { data: units, error: unitsError } = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('property_id', property.id);
  if (unitsError) throw unitsError;

  const unitIds = (units ?? []).map((unit) => unit.id);
  const tenantEmails: string[] = [];
  if (unitIds.length > 0) {
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('email')
      .in('unit_id', unitIds)
      .eq('status', 'active');
    if (tenantsError) throw tenantsError;
    tenantEmails.push(...(tenants ?? []).map((tenant) => String(tenant.email ?? '')));
  }

  const staffEmails: string[] = [];
  if (property.organization_id) {
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from('property_staff_assignments')
      .select('staff_members(email, role)')
      .eq('property_id', property.id);
    if (assignmentsError && !assignmentsError.message.toLowerCase().includes('property_staff_assignments')) throw assignmentsError;
    for (const assignment of assignments ?? []) {
      const assignedStaff = Array.isArray(assignment.staff_members) ? assignment.staff_members[0] : assignment.staff_members;
      if (assignedStaff?.email && String(assignedStaff.role).toLowerCase() === 'maintenance') {
        staffEmails.push(String(assignedStaff.email));
      }
    }

    const { data: owners, error: ownersError } = await supabaseAdmin
      .from('staff_members')
      .select('email')
      .eq('organization_id', property.organization_id)
      .ilike('role', 'owner');
    if (ownersError) throw ownersError;
    staffEmails.push(...(owners ?? []).map((member) => String(member.email ?? '')));

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .select('owner_email')
      .eq('id', property.organization_id)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (organization?.owner_email) staffEmails.push(String(organization.owner_email));
  }

  const recipients = [...new Set([...tenantEmails, ...staffEmails]
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
  if (recipients.length === 0) return { attempted: 0, sent: 0, failed: 0 };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://landbaron.app').replace(/\/$/, '');
  const announcementUrl = `${siteUrl}/dashboard/properties/${property.id}/announcements`;
  const title = announcement.title?.trim() || property.name;
  const subject = kind === 'post'
    ? `New announcement for ${property.name}: ${title}`
    : `New reply to an announcement for ${property.name}`;
  const imageUrls = announcement.image_urls ?? [];
  const imageText = imageUrls.map((url) => `\nImage: ${url}`).join('');
  const imageHtml = imageUrls.map((url) => `<p><a href="${escapeHtml(url)}">View attached image</a></p>`).join('');
  const resend = new Resend(apiKey);
  const results = await Promise.allSettled(recipients.map((recipient) => resend.emails.send({
    from,
    to: recipient,
    replyTo: process.env.RESEND_REPLY_TO_EMAIL || undefined,
    subject,
    text: `${announcement.author_name} ${kind === 'post' ? 'posted an announcement' : 'replied to an announcement'} for ${property.name}.\n\n${announcement.body}${imageText}\n\nView announcements: ${announcementUrl}`,
    html: `<p><strong>${escapeHtml(announcement.author_name)}</strong> ${kind === 'post' ? 'posted an announcement' : 'replied to an announcement'} for <strong>${escapeHtml(property.name)}</strong>.</p><p>${escapeHtml(announcement.body).replace(/\n/g, '<br />')}</p>${imageHtml}<p><a href="${announcementUrl}">View announcements</a></p>`,
  })));

  const failed = results.filter((result) => result.status === 'rejected' || (result.status === 'fulfilled' && Boolean(result.value.error))).length;
  return { attempted: recipients.length, sent: recipients.length - failed, failed };
}
