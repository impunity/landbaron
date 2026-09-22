'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

export default function AnalysisPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    const client = supabase;

    if (!client) {
      return;
    }

    const syncSession = async () => {
      const { data } = await client.auth.getSession();
      const sessionUser = data.session?.user;

      if (!sessionUser) {
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(sessionUser.email, client);
      const nextSession: SessionUser = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
      };

      setSession(nextSession);
      if (nextSession.role !== 'owner' && nextSession.role !== 'manager') {
        router.replace('/dashboard');
      }
    };

    void syncSession();

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;

      if (!nextUser) {
        setSession(null);
        router.replace('/login');
        return;
      }

      const role = await fetchUserRole(nextUser.email, client);
      const nextSessionUser: SessionUser = {
        id: nextUser.id,
        name: nextUser.user_metadata?.full_name || nextUser.email || 'User',
        email: nextUser.email || '',
        role,
      };

      setSession(nextSessionUser);
      if (nextSessionUser.role !== 'owner' && nextSessionUser.role !== 'manager') {
        router.replace('/dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  if (!session || (session.role !== 'owner' && session.role !== 'manager')) {
    return null;
  }

  const analysisLinks = [
    {
      title: 'Rent Increase Analysis',
      description: 'Model potential rent increases per unit, subtotaled by property, within California allowed limits.',
      href: '/dashboard/analysis/rent-increase',
    },
    {
      title: 'Usage Log',
      description: 'See every sign-in to the system by time, date, and user.',
      href: '/dashboard/usage-log',
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Analysis', href: '/dashboard/analysis' }]} />
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Analysis</h1>
            <p className="mt-2 text-sm text-slate-600">Reporting and analysis tools for owners and managers.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DashboardNavButtons current="analysis" role={session.role} />
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {analysisLinks.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => router.push(link.href)}
              className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <h2 className="text-lg font-semibold text-slate-900">{link.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{link.description}</p>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
