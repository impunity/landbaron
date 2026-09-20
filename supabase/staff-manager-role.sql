alter table public.staff_members
  drop constraint if exists staff_members_role_check;

alter table public.staff_members
  add constraint staff_members_role_check
  check (role in ('Owner', 'Manager', 'Maintenance', 'Contractor'));
