export type UserRole = 'owner' | 'maintenance' | 'tenant' | 'contractor';

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
const maintenanceEmails = parseEmailList(
  process.env.NEXT_PUBLIC_MAINTENANCE_EMAILS ?? process.env.NEXT_PUBLIC_CONTRACTOR_EMAILS ?? 'maintenance@demo.local',
);
const tenantEmails = parseEmailList(process.env.NEXT_PUBLIC_TENANT_EMAILS ?? 'sam@example.com');

export function getUserRoleByEmail(email?: string | null): UserRole {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return 'tenant';

  if (ownerEmails.includes(normalized)) return 'owner';
  if (maintenanceEmails.includes(normalized)) return 'maintenance';
  if (tenantEmails.includes(normalized)) return 'tenant';

  return 'tenant';
}

export async function fetchUserRole(
  email?: string | null,
  client?: any,
): Promise<UserRole> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return 'tenant';

  if (ownerEmails.includes(normalized)) return 'owner';

  if (client && typeof client.from === 'function') {
    try {
      const { data } = await client
        .from('staff_members')
        .select('role')
        .ilike('email', normalized)
        .maybeSingle();

      if (data?.role) {
        const r = String(data.role).toLowerCase();
        if (r === 'owner') return 'owner';
        if (r === 'maintenance') return 'maintenance';
        if (r === 'contractor') return 'contractor';
      }
    } catch {
      // fallback
    }
  }

  if (maintenanceEmails.includes(normalized)) return 'maintenance';
  if (tenantEmails.includes(normalized)) return 'tenant';

  return 'tenant';
}

export function getRoleLabel(role: UserRole) {
  if (role === 'owner') return 'Owner / Manager';
  if (role === 'maintenance' || role === 'contractor') return 'Maintenance Person';
  return 'Tenant';
}

export function getVisibleTickets<T extends { description?: string | null; status?: string | null }>(
  tickets: T[],
  user: SessionUser | null,
) {
  if (!user) {
    return [];
  }

  if (user.role === 'owner' || user.role === 'maintenance' || user.role === 'contractor') {
    return tickets;
  }

  const tenantEmail = user.email.trim().toLowerCase();
  return tickets.filter((ticket) => {
    const description = String(ticket.description ?? '').toLowerCase();
    return description.includes(`email: ${tenantEmail}`);
  });
}
