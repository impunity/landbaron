export type UserRole = 'owner' | 'contractor' | 'tenant';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

const parseEmailList = (value?: string) => (value ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const ownerEmails = parseEmailList(process.env.NEXT_PUBLIC_OWNER_EMAILS ?? 'owner@demo.local');
const contractorEmails = parseEmailList(process.env.NEXT_PUBLIC_CONTRACTOR_EMAILS ?? 'contractor@demo.local');
const tenantEmails = parseEmailList(process.env.NEXT_PUBLIC_TENANT_EMAILS ?? 'sam@example.com');

export function getUserRoleByEmail(email?: string | null): UserRole {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return 'tenant';

  if (ownerEmails.includes(normalized)) return 'owner';
  if (contractorEmails.includes(normalized)) return 'contractor';
  if (tenantEmails.includes(normalized)) return 'tenant';

  return 'tenant';
}

export function getRoleLabel(role: UserRole) {
  if (role === 'owner') return 'Owner';
  if (role === 'contractor') return 'Contractor';
  return 'Tenant';
}

export function getVisibleTickets<T extends { description?: string | null; status?: string | null }>(
  tickets: T[],
  user: SessionUser | null,
) {
  if (!user) {
    return [];
  }

  if (user.role === 'owner') {
    return tickets;
  }

  if (user.role === 'contractor') {
    return tickets.filter((ticket) => {
      const status = String(ticket.status ?? 'Open').trim();
      return status !== 'Resolved' && status !== 'Closed';
    });
  }

  const tenantEmail = user.email.trim().toLowerCase();
  return tickets.filter((ticket) => {
    const description = String(ticket.description ?? '').toLowerCase();
    return description.includes(`email: ${tenantEmail}`);
  });
}
