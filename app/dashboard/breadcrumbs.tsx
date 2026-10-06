'use client';

import { usePathname, useRouter } from 'next/navigation';

export type BreadcrumbItem = {
  label: string;
  href: string;
};

export function BackButton({ items }: { items: BreadcrumbItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const fallbackHref = items.length > 1 ? items[items.length - 2].href : '/dashboard';

  if (pathname === '/dashboard') return null;

  return (
    <button
      type="button"
      onClick={() => router.push(fallbackHref)}
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      <span aria-hidden="true">←</span> Back
    </button>
  );
}

export const Breadcrumbs = BackButton;
