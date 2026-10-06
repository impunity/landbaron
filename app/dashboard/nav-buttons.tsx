'use client';

import { useRouter } from 'next/navigation';

import type { UserRole } from '@/lib/auth';
import { AnnouncementsNavButton } from './announcements-nav-button';

export type NavKey = 'dashboard' | 'announcements' | 'properties' | 'tenants' | 'staff' | 'vendors' | 'door-codes' | 'analysis' | 'property-handbook' | 'solar-power' | 'organization' | 'legal-disclosures' | 'tenant-directory' | 'emergency-contacts';

type NavItem =
  | { key: 'announcements'; label: string; roles?: UserRole[] }
  | { key: Exclude<NavKey, 'announcements'>; label: string; href: string; roles?: UserRole[] };

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Maintenance Tickets', href: '/dashboard' },
  { key: 'announcements', label: 'Announcements/Discussions' },
  { key: 'properties', label: 'Properties & Units', href: '/dashboard/properties' },
  { key: 'tenants', label: 'Tenants', href: '/dashboard/tenants' },
  { key: 'staff', label: 'Staff roster', href: '/dashboard/staff', roles: ['owner', 'manager'] },
  { key: 'vendors', label: 'Approved Vendors', href: '/dashboard/vendors' },
  { key: 'door-codes', label: 'Door Codes', href: '/dashboard/door-codes', roles: ['owner', 'manager', 'maintenance', 'tenant'] },
  { key: 'analysis', label: 'Analysis', href: '/dashboard/analysis', roles: ['owner', 'manager'] },
  { key: 'property-handbook', label: 'Property Handbook', href: '/dashboard/property-handbook' },
  { key: 'solar-power', label: 'Solar Power', href: '/dashboard/solar-power' },
  { key: 'organization', label: 'Organization', href: '/dashboard/organization', roles: ['owner', 'manager'] },
  { key: 'legal-disclosures', label: 'Legal Disclosures', href: '/dashboard/legal-disclosures' },
  { key: 'tenant-directory', label: 'Tenant Directory', href: '/dashboard/tenant-portal/directory', roles: ['tenant'] },
  { key: 'emergency-contacts', label: 'Emergency Contacts', href: '/dashboard/tenant-portal/emergency-contacts', roles: ['tenant'] },
];

const TENANT_NAV_KEYS: NavKey[] = [
  'dashboard',
  'announcements',
  'vendors',
  'door-codes',
  'property-handbook',
  'solar-power',
  'legal-disclosures',
  'tenant-directory',
  'emergency-contacts',
];

// Same canonical button set on every dashboard page, minus the button for the page you're already on.
export function DashboardNavButtons({ current, role, propertyId }: { current?: NavKey; role: UserRole; propertyId?: string | null }) {
  const router = useRouter();
  const items = role === 'tenant'
    ? TENANT_NAV_KEYS.map((key) => NAV_ITEMS.find((item) => item.key === key)!).filter((item) => item.key !== current)
    : NAV_ITEMS.filter((item) => item.key !== current && (!item.roles || item.roles.includes(role)));

  return (
    <>
      {items.map((item) => <span key={item.key} className="contents">
        {item.key === 'announcements' ? <AnnouncementsNavButton propertyId={propertyId} /> : (
          <button
            type="button"
            onClick={() => router.push(item.key === 'property-handbook' && propertyId ? `${item.href}?propertyId=${encodeURIComponent(propertyId)}` : item.href)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {item.label}
          </button>
        )}
      </span>)}
    </>
  );
}
