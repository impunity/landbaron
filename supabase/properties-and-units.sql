-- Properties, Units, Tenants, Photos, and Unit Maintenance History Schema

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text,
  state text,
  postal_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_number text not null,
  rent_amount numeric,
  bedrooms integer default 1,
  bathrooms numeric default 1,
  square_feet integer,
  status text default 'occupied',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  lease_start date,
  lease_end date,
  status text not null default 'active',
  emergency_contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unit_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.unit_maintenance_notes (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  note text not null,
  category text not null default 'completed_work' check (category in ('work_to_consider', 'completed_work', 'general')),
  cost numeric,
  performed_by text,
  performed_at date default current_date,
  created_at timestamptz not null default now()
);

-- Foreign key / index references on tickets
alter table public.tickets
  add column if not exists property_id uuid references public.properties(id) on delete set null;

alter table public.tickets
  add column if not exists unit_id uuid references public.units(id) on delete set null;

create index if not exists properties_address_idx on public.properties (address);
create index if not exists units_property_id_idx on public.units (property_id);
create index if not exists tenants_unit_id_idx on public.tenants (unit_id);
create index if not exists unit_photos_unit_id_idx on public.unit_photos (unit_id);
create index if not exists unit_maintenance_notes_unit_id_idx on public.unit_maintenance_notes (unit_id);
create index if not exists tickets_unit_id_idx on public.tickets (unit_id);
create index if not exists tickets_property_id_idx on public.tickets (property_id);

-- Storage bucket for unit photos
insert into storage.buckets (id, name, public)
values ('unit-photos', 'unit-photos', true)
on conflict (id) do nothing;

create policy "Public unit photo access"
on storage.objects for select
using (bucket_id = 'unit-photos');

create policy "Authenticated unit photo uploads"
on storage.objects for insert
with check (bucket_id = 'unit-photos');
