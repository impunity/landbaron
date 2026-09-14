alter table public.tickets
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists tickets_created_by_idx
  on public.tickets (created_by);