begin;

alter table public.tickets
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by_name text;

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  parent_id uuid,
  author_user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  unique (ticket_id, id),
  foreign key (ticket_id, parent_id) references public.ticket_messages(ticket_id, id)
);
create index if not exists ticket_messages_ticket_created_idx
  on public.ticket_messages(ticket_id, created_at);
alter table public.ticket_messages enable row level security;
revoke all on public.ticket_messages from anon, authenticated;
grant all on public.ticket_messages to service_role;

create or replace function public.track_ticket_resolution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(new.status) = 'resolved' then
    if lower(old.status) = 'resolved' then
      new.resolved_at := old.resolved_at;
      new.resolved_by := old.resolved_by;
      new.resolved_by_name := old.resolved_by_name;
    else
      new.resolved_at := now();
    end if;
  elsif lower(new.status) = 'archived' then
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
    new.resolved_by_name := old.resolved_by_name;
  else
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolved_by_name := null;
  end if;
  return new;
end;
$$;
drop trigger if exists track_ticket_resolution on public.tickets;
create trigger track_ticket_resolution before update of status on public.tickets
  for each row execute function public.track_ticket_resolution();

commit;
