create table if not exists public.property_solar_integrations (
  property_id uuid primary key references public.properties(id) on delete cascade,
  enabled boolean not null default false,
  site_id text,
  client_id text,
  client_secret_encrypted text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_solar_integrations enable row level security;

create table if not exists public.solar_oauth_states (
  state uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists solar_oauth_states_expiry_idx on public.solar_oauth_states (expires_at);
alter table public.solar_oauth_states enable row level security;