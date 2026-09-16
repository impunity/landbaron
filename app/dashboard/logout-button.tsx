'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export function LogoutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await supabase?.auth.signOut();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={signingOut}
      className="fixed right-4 top-3 z-50 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {signingOut ? 'Logging out...' : 'Log out'}
    </button>
  );
}