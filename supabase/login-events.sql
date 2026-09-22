create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text,
  avatar_url text,
  role text,
  created_at timestamptz not null default now()
);

create index if not exists login_events_created_at_idx
  on public.login_events (created_at desc);

alter table public.login_events enable row level security;
