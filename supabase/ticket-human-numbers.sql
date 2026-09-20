create sequence if not exists public.ticket_number_seq;

alter table public.tickets
  add column if not exists ticket_number integer;

with numbered_tickets as (
  select
    id,
    row_number() over (order by created_at, id)::integer as next_ticket_number
  from public.tickets
  where ticket_number is null
)
update public.tickets as tickets
set ticket_number = numbered_tickets.next_ticket_number
from numbered_tickets
where tickets.id = numbered_tickets.id;

select setval(
  'public.ticket_number_seq',
  greatest(coalesce((select max(ticket_number) from public.tickets), 0), 1),
  true
);

alter table public.tickets
  alter column ticket_number set default nextval('public.ticket_number_seq');

create unique index if not exists tickets_ticket_number_idx
  on public.tickets (ticket_number)
  where ticket_number is not null;
