import Link from 'next/link';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl justify-end">
          <Link
            href="/dashboard/vendors"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Approved Vendors
          </Link>
        </div>
      </div>
      {children}
    </>
  );
}
