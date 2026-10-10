export type OwnerContact = {
  name: string;
  email: string | null;
  phone: string | null;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  createdAt: string;
  owners: OwnerContact[];
  tenants: number;
  ownersCount: number;
  managers: number;
  maintenance: number;
  contractors: number;
  properties: number;
  units: number;
  lastLoginAt: string | null;
  daysSinceLastLogin: number | null;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  owner_email: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};

type StaffRecord = {
  organization_id: string | null;
  name: string;
  email: string;
  phone_number: string | null;
  role: string;
};

export function summarizeOrganizations(
  organizations: OrganizationRecord[],
  staff: StaffRecord[],
  tenants: { organization_id: string | null }[],
  properties: { organization_id: string | null }[],
  units: { organization_id: string | null }[],
  logins: { organization_id: string | null; created_at: string }[],
  now = Date.now(),
): PlatformOrganization[] {
  const summaries = new Map(organizations.map((organization) => [organization.id, {
    id: organization.id,
    name: organization.name,
    createdAt: organization.created_at,
    owners: [] as OwnerContact[],
    tenants: 0,
    ownersCount: 0,
    managers: 0,
    maintenance: 0,
    contractors: 0,
    properties: 0,
    units: 0,
    lastLoginAt: null as string | null,
    daysSinceLastLogin: null as number | null,
  }]));

  for (const member of staff) {
    const summary = summaries.get(member.organization_id ?? '');
    if (!summary) continue;
    const role = member.role.toLowerCase();
    if (role === 'owner') {
      if (!summary.owners.some((owner) => owner.email?.toLowerCase() === member.email.toLowerCase())) {
        summary.owners.push({ name: member.name, email: member.email, phone: member.phone_number });
      }
    } else if (role === 'manager') summary.managers++;
    else if (role === 'maintenance') summary.maintenance++;
    else if (role === 'contractor') summary.contractors++;
  }

  for (const organization of organizations) {
    const summary = summaries.get(organization.id)!;
    const ownerEmail = organization.owner_email?.trim().toLowerCase();
    const primaryOwner = summary.owners.find((owner) => owner.email?.toLowerCase() === ownerEmail);
    if (primaryOwner && !primaryOwner.phone) primaryOwner.phone = organization.contact_phone;
    if (ownerEmail && !summary.owners.some((owner) => owner.email?.toLowerCase() === ownerEmail)) {
      summary.owners.push({
        name: organization.name,
        email: organization.owner_email,
        phone: organization.contact_phone,
      });
    }
    summary.ownersCount = summary.owners.length;
  }

  for (const [records, key] of [[tenants, 'tenants'], [properties, 'properties'], [units, 'units']] as const) {
    for (const record of records) {
      const summary = summaries.get(record.organization_id ?? '');
      if (summary) summary[key]++;
    }
  }
  for (const login of logins) {
    const summary = summaries.get(login.organization_id ?? '');
    const timestamp = Date.parse(login.created_at);
    if (!summary || !Number.isFinite(timestamp)) continue;
    if (!summary.lastLoginAt || timestamp > Date.parse(summary.lastLoginAt)) {
      summary.lastLoginAt = login.created_at;
      summary.daysSinceLastLogin = Math.max(0, Math.floor((now - timestamp) / 86_400_000));
    }
  }
  return [...summaries.values()];
}

export type OrganizationSortKey = 'name' | 'tenants' | 'ownersCount' | 'managers' | 'maintenance' | 'contractors' | 'properties' | 'units' | 'daysSinceLastLogin';

export function compareOrganizations(a: PlatformOrganization, b: PlatformOrganization, key: OrganizationSortKey, direction: 'asc' | 'desc') {
  const first = a[key];
  const second = b[key];
  // Organizations without a recorded login stay last in either direction.
  if (first === null || second === null) {
    if (first === second) return a.name.localeCompare(b.name);
    return first === null ? 1 : -1;
  }
  const comparison = typeof first === 'string' && typeof second === 'string'
    ? first.localeCompare(second)
    : Number(first) - Number(second);
  return (direction === 'asc' ? comparison : -comparison) || a.name.localeCompare(b.name);
}

type ResourceDefinition = {
  label: string;
  table: string;
  select: string;
  organizationFilter: string;
  order: string;
};

const direct = (label: string, table: string, select = '*'): ResourceDefinition => ({
  label, table, select, organizationFilter: 'organization_id', order: 'id',
});
const property = (label: string, table: string, select = '*', order = 'id'): ResourceDefinition => ({
  label, table, select: `${select},properties!inner(organization_id)`, organizationFilter: 'properties.organization_id', order,
});
const unit = (label: string, table: string): ResourceDefinition => ({
  label, table, select: '*,units!inner(properties!inner(organization_id))',
  organizationFilter: 'units.properties.organization_id', order: 'id',
});
const announcement = (label: string, table: string, order = 'id'): ResourceDefinition => ({
  label, table, select: '*,property_announcements!inner(properties!inner(organization_id))',
  organizationFilter: 'property_announcements.properties.organization_id', order,
});

export const PLATFORM_RESOURCES = {
  properties: direct('Properties', 'properties'),
  units: direct('Units', 'units'),
  tenants: direct('Tenants', 'tenants'),
  staff: direct('Staff roster', 'staff_members'),
  tickets: direct('Maintenance tickets', 'tickets'),
  receipts: { label: 'Ticket receipts', table: 'ticket_receipts', select: '*,tickets!inner(organization_id)', organizationFilter: 'tickets.organization_id', order: 'id' },
  vendors: direct('Approved vendors', 'approved_vendors'),
  announcements: property('Announcements', 'property_announcements'),
  replies: announcement('Discussion replies', 'property_announcement_replies'),
  reactions: announcement('Discussion reactions', 'property_announcement_reactions', 'announcement_id,user_id'),
  reads: announcement('Discussion read receipts', 'property_announcement_reads', 'user_id,announcement_id'),
  photos: unit('Unit photos', 'unit_photos'),
  history: unit('Unit maintenance history', 'unit_maintenance_notes'),
  improvements: unit('Tenant improvement photos', 'tenant_improvement_photos'),
  assignments: property('Property staff assignments', 'property_staff_assignments'),
  doors: property('Door codes', 'property_door_locks'),
  garages: property('Garages', 'property_garages'),
  fees: unit('Unit fees', 'unit_fees'),
  income: property('Property income sources', 'property_income_sources'),
  handbooks: property('Property handbooks', 'property_handbooks', '*', 'property_id'),
  solar: property('Solar integration status', 'property_solar_integrations', 'property_id,enabled,site_id,client_id,connected_at,token_expires_at,created_at,updated_at', 'property_id'),
  disclosures: direct('Legal disclosures', 'legal_disclosures'),
  requests: direct('Access requests', 'access_requests', 'id,organization_id,requested_role,name,email,phone,address,unit_id,status,created_at,resolved_at'),
  logins: direct('Login history', 'login_events'),
} satisfies Record<string, ResourceDefinition>;

export type PlatformResourceKey = keyof typeof PLATFORM_RESOURCES;

export function isPlatformResourceKey(value: string): value is PlatformResourceKey {
  return Object.hasOwn(PLATFORM_RESOURCES, value);
}

export const PLATFORM_PAGE_SIZE = 50;
