create table if not exists public.property_announcement_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.property_announcements(id) on delete cascade,
  read_at timestamptz not null,
  primary key (user_id, announcement_id)
);

create index if not exists property_announcement_reads_announcement_idx
  on public.property_announcement_reads (announcement_id);

alter table public.property_announcement_reads enable row level security;
revoke all on public.property_announcement_reads from anon, authenticated;
grant all on public.property_announcement_reads to service_role;
