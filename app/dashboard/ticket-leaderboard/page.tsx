'use client';

import { useEffect, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import { fetchUserRole, type UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { buildTicketLeaderboard } from '@/lib/ticket-leaderboard';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

export default function TicketLeaderboardPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [result, setResult] = useState<ReturnType<typeof buildTicketLeaderboard> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session) throw new Error('Sign in is required.');
        setRole(await fetchUserRole(session.user.email, supabase));
        const response = await fetch('/api/tickets/leaderboard', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Leaderboard could not be loaded.');
        setResult(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Leaderboard could not be loaded.');
      }
    })();
  }, []);
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Breadcrumbs items={[{ label: 'Maintenance Tickets', href: '/dashboard' }, { label: 'Ticket Leaderboard', href: '/dashboard/ticket-leaderboard' }]} />
        {role && <nav className="my-5 flex flex-wrap gap-2"><DashboardNavButtons role={role} /></nav>}
        <h1 className="mt-5 text-3xl font-semibold">Ticket Leaderboard</h1>
        <p className="mt-2 text-sm text-slate-600">Credit goes to the person who resolves the ticket. Average age is the time from opening to resolution. Archived resolutions count; re-opened and dismissed tickets do not.</p>
        {error ? <p role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p> : !result ? <p className="mt-6">Loading leaderboard...</p> : (
          <>
            <p className="mt-5 text-sm text-slate-600">{result.total_resolved} tickets resolved in your organization.{result.unattributed > 0 && ` ${result.unattributed} historical tickets have no recorded resolver; they are included in the percentage denominator but not assigned to a person.`}</p>
            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-4">Rank</th><th className="p-4">Resolver</th><th className="p-4 text-right">Tickets resolved</th><th className="p-4 text-right">% of all resolved tickets</th><th className="p-4 text-right">Average ticket age (days)</th></tr></thead>
                <tbody>{result.rows.map((row, index) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-4 font-semibold">#{index + 1}</td>
                    <td className="p-4"><span className="flex items-center gap-2 font-medium">{index === 0 ? <Trophy aria-label="Gold trophy" className="size-6 shrink-0 fill-yellow-200 text-yellow-600" /> : index === 1 ? <Medal aria-label="Silver medal" className="size-6 shrink-0 fill-slate-200 text-slate-500" /> : index === 2 ? <Medal aria-label="Bronze medal" className="size-6 shrink-0 fill-amber-200 text-amber-700" /> : null}{row.name}</span></td>
                    <td className="p-4 text-right tabular-nums">{row.resolved_count}</td>
                    <td className="p-4 text-right tabular-nums">{row.percentage.toFixed(1)}%</td>
                    <td className="p-4 text-right tabular-nums">{row.average_days.toFixed(1)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!result.rows.length && <p className="p-6 text-sm text-slate-500">No recorded resolvers yet. Resolve a ticket to join the leaderboard.</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
