do $$
declare
  status_constraint_name text;
begin
  select conname
  into status_constraint_name
  from pg_constraint
  where conrelid = 'public.tickets'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
  limit 1;

  if status_constraint_name is not null then
    execute format('alter table public.tickets drop constraint %I', status_constraint_name);
  end if;

  alter table public.tickets
    add constraint tickets_status_check
    check (lower(status) in ('open', 'in progress', 'waiting on parts', 'resolved', 'closed', 'archived'));
end $$;