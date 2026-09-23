-- Phase 1: Organizations (multi-tenant foundation). This migration is additive only:
-- it creates the organizations table, links existing tables to it via a nullable
-- organization_id column, and backfills exactly one default organization from the
-- data that already exists so nothing is lost or reassigned incorrectly.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Organization',
  owner_email text,
  owner_user_id uuid references auth.users(id) on delete set null,
  address text,
  city text,
  state text,
  postal_code text,
  contact_email text,
  contact_phone text,
  tax_id text,
  website_url text,
  avatar_url text,
  invite_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_invite_code_idx
  on public.organizations (invite_code)
  where invite_code is not null;

alter table public.organizations enable row level security;

-- Create exactly one default organization if none exists yet, so existing data has
-- somewhere to attach to. Safe to run multiple times.
insert into public.organizations (name)
select 'My Organization'
where not exists (select 1 from public.organizations);

alter table public.properties
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.units
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.tenants
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.staff_members
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.approved_vendors
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.tickets
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.login_events
  add column if not exists organization_id uuid references public.organizations(id);

-- Backfill every existing row to the single default organization. No rows are deleted
-- or reassigned away from their current data; this only fills in a previously
-- nonexistent column.
update public.properties
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.units
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.tenants
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.staff_members
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.approved_vendors
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.tickets
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.login_events
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

create index if not exists properties_organization_id_idx on public.properties (organization_id);
create index if not exists units_organization_id_idx on public.units (organization_id);
create index if not exists tenants_organization_id_idx on public.tenants (organization_id);
create index if not exists staff_members_organization_id_idx on public.staff_members (organization_id);
create index if not exists approved_vendors_organization_id_idx on public.approved_vendors (organization_id);
create index if not exists tickets_organization_id_idx on public.tickets (organization_id);
create index if not exists login_events_organization_id_idx on public.login_events (organization_id);

insert into storage.buckets (id, name, public)
values ('organization-avatars', 'organization-avatars', true)
on conflict (id) do nothing;

drop policy if exists "Public organization avatar access" on storage.objects;
create policy "Public organization avatar access"
on storage.objects for select
using (bucket_id = 'organization-avatars');

drop policy if exists "Authenticated organization avatar uploads" on storage.objects;
create policy "Authenticated organization avatar uploads"
on storage.objects for insert
with check (bucket_id = 'organization-avatars');

drop policy if exists "Authenticated organization avatar updates" on storage.objects;
create policy "Authenticated organization avatar updates"
on storage.objects for update
using (bucket_id = 'organization-avatars');
