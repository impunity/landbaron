begin;

alter table public.tenants add column if not exists about_me text
  check (char_length(about_me) <= 250 and cardinality(regexp_split_to_array(btrim(about_me), '\s+')) <= 30);

create or replace function public.get_tenant_birthdates(tenant_ids uuid[])
returns table (tenant_id uuid, birthdate date)
language sql stable security definer
set search_path = ''
as $$
  select t.id, p.birthdate
  from public.tenants t
  join auth.users u on lower(u.email) = lower(t.email)
  join public.user_preferences p on p.user_id = u.id
  where t.id = any(tenant_ids) and p.birthdate is not null;
$$;
revoke all on function public.get_tenant_birthdates(uuid[]) from public, anon, authenticated;
grant execute on function public.get_tenant_birthdates(uuid[]) to service_role;

commit;
