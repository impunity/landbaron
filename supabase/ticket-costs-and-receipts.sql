alter table public.tickets
  add column if not exists labor_cost numeric;

alter table public.tickets
  add column if not exists materials_cost numeric;

alter table public.unit_photos
  add column if not exists is_primary boolean not null default false;

create table if not exists public.ticket_receipts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_receipts_ticket_id_idx
  on public.ticket_receipts (ticket_id, created_at);

insert into storage.buckets (id, name, public)
values ('ticket-receipts', 'ticket-receipts', true)
on conflict (id) do nothing;

drop policy if exists "Public ticket receipt access" on storage.objects;
create policy "Public ticket receipt access"
on storage.objects for select
using (bucket_id = 'ticket-receipts');

drop policy if exists "Authenticated ticket receipt uploads" on storage.objects;
create policy "Authenticated ticket receipt uploads"
on storage.objects for insert
with check (bucket_id = 'ticket-receipts');