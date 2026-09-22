'use client';

import { useRouter } from 'next/navigation';

export type BreadcrumbItem = {
  label: string;
  href: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-2">
          {index > 0 && <span className="text-xs text-slate-400">/</span>}
          <button
            type="button"
            onClick={() => router.push(item.href)}
            className={
              index === items.length - 1
                ? 'text-xs font-semibold uppercase tracking-[0.2em] text-slate-700'
                : 'text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-800'
            }
          >
            {item.label}
          </button>
        </span>
      ))}
    </div>
  );
}
