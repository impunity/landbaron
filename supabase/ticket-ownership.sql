alter table public.tickets
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.tickets
  add column if not exists cc_staff_emails text[] not null default '{}';

alter table public.tickets
  add column if not exists cc_staff_emails text[] not null default '{}';

create index if not exists tickets_created_by_idx
 on public.tickets (created_by);