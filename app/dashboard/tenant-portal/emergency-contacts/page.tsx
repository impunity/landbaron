'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchUserRole, type UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { DashboardNavButtons } from '../../nav-buttons';

type Contact = { name: string; email?: string | null; phone_number?: string | null; phone?: string | null; role?: string; avatar_url?: string | null; assignment_type?: string };
export default function EmergencyContactsPage() {
  const router = useRouter();
  const [property, setProperty] = useState<{ id: string; name: string; address: string } | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { const session = (await supabase?.auth.getSession())?.data.session; if (!session) { router.replace('/login'); return; } setRole(await fetchUserRole(session.user.email, supabase)); const response = await fetch('/api/emergency-contacts', { headers: { Authorization: `Bearer ${session.access_token}` } }); const result = await response.json(); if (!response.ok) setError(result.error); else { setProperty(result.property); setContacts([...(result.staff ?? []).map((c: Contact) => ({ ...c, role: c.assignment_type === 'primary' ? 'Primary Maintenance' : 'Secondary Maintenance' })), ...(result.owners ?? []).map((c: Contact) => ({ ...c, role: 'Owner' }))]); } })(); }, [router]);
  return <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900"><div className="mx-auto max-w-4xl"><header className="mb-8 flex flex-wrap items-center justify-between gap-3"><div>{role && <div className="mb-4 flex flex-wrap gap-2"><DashboardNavButtons current="emergency-contacts" role={role} propertyId={property?.id} /></div>}<h1 className="mt-2 text-3xl font-semibold">Emergency Contacts</h1><p className="mt-1 text-sm text-slate-500">{property?.name} · {property?.address}</p></div></header>{error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : <div className="grid gap-4 sm:grid-cols-2">{contacts.map((contact, index) => <div key={`${contact.email}-${index}`} className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><img src={contact.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=0f766e&color=fff&size=160`} alt={`${contact.name} avatar`} className="h-20 w-20 shrink-0 rounded-full object-cover"/><div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"><p className="font-semibold">{contact.name}</p><p className="text-xs uppercase tracking-wider text-slate-500">{contact.role}</p>{contact.email && <a className="mt-2 block w-max text-sm text-slate-700 underline" href={`mailto:${contact.email}`}>{contact.email}</a>}{(contact.phone_number || contact.phone) && <a className="block w-max text-sm text-slate-700 underline" href={`tel:${contact.phone_number || contact.phone}`}>{contact.phone_number || contact.phone}</a>}</div></div>)}</div>}</div></main>;
}
