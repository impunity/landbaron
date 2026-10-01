create unique index if not exists units_id_property_id_key on public.units (id, property_id);

create table if not exists public.property_door_locks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid,
  door text not null check (length(trim(door)) between 1 and 100),
  code text not null default '',
  programming_code text not null default '',
  created_at timestamptz not null default now(),
  foreign key (unit_id, property_id) references public.units(id, property_id) on delete cascade
);

create index if not exists property_door_locks_property_idx on public.property_door_locks (property_id, unit_id);
alter table public.property_door_locks enable row level security;

create table if not exists public.property_garages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid,
  garage_id text not null check (length(trim(garage_id)) between 1 and 100),
  code text not null default '',
  programming_code text not null default '',
  garage_rent numeric(10, 2) check (garage_rent >= 0),
  created_at timestamptz not null default now(),
  foreign key (unit_id, property_id) references public.units(id, property_id) on delete set null (unit_id)
);

create unique index if not exists property_garages_identifier_key on public.property_garages (property_id, lower(garage_id));
create index if not exists property_garages_unit_idx on public.property_garages (unit_id);
alter table public.property_garages enable row level security;