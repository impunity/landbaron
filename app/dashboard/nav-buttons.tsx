'use client';

import { useRouter } from 'next/navigation';

import type { UserRole } from '@/lib/auth';

export type NavKey = 'dashboard' | 'vendors' | 'properties' | 'tenants' | 'staff' | 'analysis';

const NAV_ITEMS: Array<{ key: NavKey; label: string; href: string; roles?: UserRole[] }> = [
  { key: 'dashboard', label: 'Maintenance Tickets', href: '/dashboard' },
  { key: 'vendors', label: 'Approved Vendors', href: '/dashboard/vendors' },
  { key: 'properties', label: 'Properties & Units', href: '/dashboard/properties' },
  { key: 'tenants', label: 'Tenants', href: '/dashboard/tenants' },
  { key: 'staff', label: 'Staff roster', href: '/dashboard/staff', roles: ['owner', 'manager'] },
  { key: 'analysis', label: 'Analysis', href: '/dashboard/analysis', roles: ['owner', 'manager'] },
];

// Same canonical button set on every dashboard page, minus the button for the page you're already on.
export function DashboardNavButtons({ current, role }: { current?: NavKey; role: UserRole }) {
  const router = useRouter();

  return (
    <>
      {NAV_ITEMS.filter((item) => item.key !== current && (!item.roles || item.roles.includes(role))).map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => router.push(item.href)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {item.label}
        </button>
      ))}
    </>
  );
}
