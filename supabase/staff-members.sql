create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone_number text,
  role text not null default 'Maintenance' check (role in ('Owner', 'Manager', 'Maintenance', 'Contractor')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_members
  add column if not exists avatar_url text;

alter table public.staff_members
  add column if not exists phone_number text;

alter table public.tickets
  add column if not exists assigned_to text;

create index if not exists tickets_assigned_to_idx
  on public.tickets (assigned_to);

alter table public.staff_members enable row level security;

drop policy if exists "Owners can view staff" on public.staff_members;
drop policy if exists "Owners can insert staff" on public.staff_members;
drop policy if exists "Owners can update staff" on public.staff_members;
drop policy if exists "Owners can delete staff" on public.staff_members;

create policy "Owners can view staff"
on public.staff_members
for select
using (true);

create policy "Owners can insert staff"
on public.staff_members
for insert
with check (true);

create policy "Owners can update staff"
on public.staff_members
for update
using (true)
with check (true);

create policy "Owners can delete staff"
on public.staff_members
for delete
using (true);
