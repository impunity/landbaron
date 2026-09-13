create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null default 'Maintenance' check (role in ('Owner', 'Maintenance', 'Contractor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;

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
