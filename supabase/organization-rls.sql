-- Organization-based Row Level Security.
--
-- Defense in depth only: the app's API routes use the Supabase service role, which
-- bypasses RLS, so these policies do not change app behavior. They protect against
-- direct access with the anon/publishable key.
--
-- Additive and idempotent. No rows are deleted or moved between organizations.

-- 1. Ensure the organization links these policies depend on exist and are populated.
alter table public.units
  add column if not exists organization_id uuid references public.organizations(id);

alter table public.tenants
  add column if not exists organization_id uuid references public.organizations(id);

update public.units u
set organization_id = p.organization_id
from public.properties p
where u.property_id = p.id
  and u.organization_id is null
  and p.organization_id is not null;

update public.tenants t
set organization_id = p.organization_id
from public.properties p
where t.property_id = p.id
  and t.organization_id is null
  and p.organization_id is not null;

-- Any stragglers fall back to the original organization so nothing becomes unreachable.
update public.units
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

update public.tenants
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null;

create index if not exists units_organization_id_idx on public.units (organization_id);
create index if not exists tenants_organization_id_idx on public.tenants (organization_id);

-- 2. Membership resolver. SECURITY DEFINER so policies can read these tables without
-- recursing through the very policies being evaluated.
create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.organizations o
  where o.owner_user_id = auth.uid()
     or lower(o.owner_email) = lower(nullif(auth.jwt() ->> 'email', ''))
  union
  select s.organization_id
  from public.staff_members s
  where s.organization_id is not null
    and lower(s.email) = lower(nullif(auth.jwt() ->> 'email', ''))
  union
  select t.organization_id
  from public.tenants t
  where t.organization_id is not null
    and lower(t.email) = lower(nullif(auth.jwt() ->> 'email', ''))
$$;

revoke all on function public.current_user_organization_ids() from public;
grant execute on function public.current_user_organization_ids() to authenticated;

-- 3. Enable RLS everywhere these policies apply.
alter table public.organizations enable row level security;
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.tenants enable row level security;
alter table public.staff_members enable row level security;
alter table public.approved_vendors enable row level security;
alter table public.tickets enable row level security;
alter table public.login_events enable row level security;
alter table public.access_requests enable row level security;
alter table public.unit_photos enable row level security;
alter table public.unit_maintenance_notes enable row level security;

-- 4. Replace the previous permissive staff policies.
drop policy if exists "Owners can view staff" on public.staff_members;
drop policy if exists "Owners can insert staff" on public.staff_members;
drop policy if exists "Owners can update staff" on public.staff_members;
drop policy if exists "Owners can delete staff" on public.staff_members;

-- 5. Organization-scoped policies.
drop policy if exists "Members access their organization" on public.organizations;
create policy "Members access their organization"
on public.organizations for all to authenticated
using (id in (select public.current_user_organization_ids()))
with check (id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org properties" on public.properties;
create policy "Members access org properties"
on public.properties for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org units" on public.units;
create policy "Members access org units"
on public.units for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org tenants" on public.tenants;
create policy "Members access org tenants"
on public.tenants for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org staff" on public.staff_members;
create policy "Members access org staff"
on public.staff_members for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org vendors" on public.approved_vendors;
create policy "Members access org vendors"
on public.approved_vendors for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org tickets" on public.tickets;
create policy "Members access org tickets"
on public.tickets for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org login events" on public.login_events;
create policy "Members access org login events"
on public.login_events for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "Members access org access requests" on public.access_requests;
create policy "Members access org access requests"
on public.access_requests for all to authenticated
using (organization_id in (select public.current_user_organization_ids()))
with check (organization_id in (select public.current_user_organization_ids()));

-- 6. Child tables inherit scope from their parent unit.
drop policy if exists "Members access org unit photos" on public.unit_photos;
create policy "Members access org unit photos"
on public.unit_photos for all to authenticated
using (exists (
  select 1 from public.units u
  where u.id = unit_photos.unit_id
    and u.organization_id in (select public.current_user_organization_ids())
))
with check (exists (
  select 1 from public.units u
  where u.id = unit_photos.unit_id
    and u.organization_id in (select public.current_user_organization_ids())
));

drop policy if exists "Members access org unit notes" on public.unit_maintenance_notes;
create policy "Members access org unit notes"
on public.unit_maintenance_notes for all to authenticated
using (exists (
  select 1 from public.units u
  where u.id = unit_maintenance_notes.unit_id
    and u.organization_id in (select public.current_user_organization_ids())
))
with check (exists (
  select 1 from public.units u
  where u.id = unit_maintenance_notes.unit_id
    and u.organization_id in (select public.current_user_organization_ids())
));
