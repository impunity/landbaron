-- Phase 2: invitation-based access requests. Additive only; existing rows remain unchanged.
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_role text not null check (requested_role in ('tenant', 'maintenance', 'contractor', 'manager')),
  name text not null,
  email text not null,
  phone text,
  address text,
  unit_id uuid references public.units(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists access_requests_organization_idx
  on public.access_requests (organization_id, status, created_at desc);
create index if not exists access_requests_token_idx
  on public.access_requests (token);

alter table public.access_requests enable row level security;
