alter table public.units
  add column if not exists has_garage boolean not null default false;

alter table public.units
  add column if not exists garage_rent numeric;

create table if not exists public.unit_fees (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists unit_fees_unit_idx on public.unit_fees (unit_id);

alter table public.unit_fees enable row level security;

create table if not exists public.property_income_sources (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists property_income_sources_property_idx on public.property_income_sources (property_id);

alter table public.property_income_sources enable row level security;
