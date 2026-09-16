import type { ReactNode } from 'react';

import { LogoutButton } from './logout-button';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 pt-12">
      <LogoutButton />
      {children}
    </div>
  );
}