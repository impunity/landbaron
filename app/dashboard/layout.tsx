import type { ReactNode } from 'react';

import { UserStatusBar } from './user-status-bar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <UserStatusBar />
      {children}
    </>
  );
}
