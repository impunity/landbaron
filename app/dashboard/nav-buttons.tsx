'use client';

import { useRouter } from 'next/navigation';

import type { UserRole } from '@/lib/auth';
import { AnnouncementsNavButton } from './announcements-nav-button';

export type NavKey = 'dashboard' | 'vendors' | 'properties' | 'tenants' | 'staff' | 'analysis' | 'organization' | 'door-codes' | 'solar-power' | 'property-handbook' | 'tenant-directory' | 'emergency-contacts' | 'legal-disclosures';

const NAV_ITEMS: Array<{ key: NavKey; label: string; href: string; roles?: UserRole[] }> = [
  { key: 'dashboard', label: 'Maintenance Tickets', href: '/dashboard' },
  { key: 'vendors', label: 'Approved Vendors', href: '/dashboard/vendors' },
  { key: 'properties', label: 'Properties & Units', href: '/dashboard/properties' },
  { key: 'door-codes', label: 'Door Codes', href: '/dashboard/door-codes', roles: ['owner', 'manager', 'maintenance', 'tenant'] },
  { key: 'solar-power', label: 'Solar Power', href: '/dashboard/solar-power' },
  { key: 'property-handbook', label: 'Property Handbook', href: '/dashboard/property-handbook' },
  { key: 'tenant-directory', label: 'Tenant Directory', href: '/dashboard/tenant-portal/directory', roles: ['tenant'] },
  { key: 'emergency-contacts', label: 'Emergency Contacts', href: '/dashboard/tenant-portal/emergency-contacts', roles: ['tenant'] },
  { key: 'legal-disclosures', label: 'Legal Disclosures', href: '/dashboard/legal-disclosures' },
  { key: 'tenants', label: 'Tenants', href: '/dashboard/tenants' },
  { key: 'staff', label: 'Staff roster', href: '/dashboard/staff', roles: ['owner', 'manager'] },
  { key: 'analysis', label: 'Analysis', href: '/dashboard/analysis', roles: ['owner', 'manager'] },
  { key: 'organization', label: 'Organization', href: '/dashboard/organization', roles: ['owner', 'manager'] },
];

const TENANT_NAV_KEYS: NavKey[] = [
  'dashboard',
  'tenant-directory',
  'vendors',
  'door-codes',
  'emergency-contacts',
  'solar-power',
  'property-handbook',
  'legal-disclosures',
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
        {role === 'tenant' && item.key === 'tenant-directory' && <AnnouncementsNavButton propertyId={propertyId} />}
        <button
          type="button"
          onClick={() => router.push(item.key === 'property-handbook' && propertyId ? `${item.href}?propertyId=${encodeURIComponent(propertyId)}` : item.href)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {role === 'tenant' && item.key === 'dashboard' ? 'Maintenance Tickets' : item.label}
        </button>
      </span>)}
      {role !== 'tenant' && <AnnouncementsNavButton propertyId={propertyId} />}
    </>
  );
}
