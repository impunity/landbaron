-- Phase 2 follow-up: make organization ownership explicit before scoping goes live.
-- Additive and idempotent: it never deletes rows and never moves data between
-- organizations. It only fills in ownership/links that were previously blank so the
-- original portfolio stays attached to its owner once queries are organization-scoped.

-- 1. Claim the original (oldest) organization for the legacy owner if unclaimed.
update public.organizations
set owner_email = 'scrosby@gmail.com'
where id = (select id from public.organizations order by created_at asc limit 1)
  and owner_email is null;

-- 2. Guarantee the legacy owner has an Owner staff record linked to that organization.
insert into public.staff_members (name, email, role, organization_id)
select 'Owner', 'scrosby@gmail.com', 'Owner', (select id from public.organizations order by created_at asc limit 1)
where not exists (
  select 1 from public.staff_members where lower(email) = 'scrosby@gmail.com'
);

update public.staff_members
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where lower(email) = 'scrosby@gmail.com'
  and organization_id is null;

-- 3. Backfill any rows still missing an organization link to the original organization.
update public.properties
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
