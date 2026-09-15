-- Properties, Units, Tenants, Photos, and Unit Maintenance History Migration & Schema
-- This script ensures all tables exist, adds all required columns, and removes any obsolete constraints from older schemas.

-- 1. PROPERTIES TABLE
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

alter table public.properties
  add column if not exists address text;

alter table public.properties
  add column if not exists city text;

alter table public.properties
  add column if not exists state text;

alter table public.properties
  add column if not exists postal_code text;

alter table public.properties
  add column if not exists notes text;

alter table public.properties
  add column if not exists created_at timestamptz not null default now();

alter table public.properties
  add column if not exists updated_at timestamptz not null default now();

-- Drop obsolete landlord_id NOT NULL and FK constraints if present from older schemas
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties' and column_name = 'landlord_id'
  ) then
    alter table public.properties alter column landlord_id drop not null;
    alter table public.properties drop constraint if exists properties_landlord_id_fkey;
  end if;
end $$;


-- 2. UNITS TABLE
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

alter table public.units
  add column if not exists rent_amount numeric;

alter table public.units
  add column if not exists bedrooms integer default 1;

alter table public.units
  add column if not exists bathrooms numeric default 1;

alter table public.units
  add column if not exists square_feet integer;

alter table public.units
  add column if not exists status text default 'occupied';

alter table public.units
  add column if not exists notes text;

alter table public.units
  add column if not exists created_at timestamptz not null default now();

alter table public.units
  add column if not exists updated_at timestamptz not null default now();


-- 3. TENANTS TABLE
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

alter table public.tenants
  add column if not exists unit_id uuid references public.units(id) on delete cascade;

alter table public.tenants
  add column if not exists property_id uuid references public.properties(id) on delete cascade;

alter table public.tenants
  add column if not exists email text;

alter table public.tenants
  add column if not exists phone text;

alter table public.tenants
  add column if not exists lease_start date;

alter table public.tenants
  add column if not exists lease_end date;

alter table public.tenants
  add column if not exists status text not null default 'active';

alter table public.tenants
  add column if not exists emergency_contact text;

alter table public.tenants
  add column if not exists notes text;

alter table public.tenants
  add column if not exists created_at timestamptz not null default now();

alter table public.tenants
  add column if not exists updated_at timestamptz not null default now();

-- Drop obsolete constraints on tenants columns if present from older schemas
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'phone_number'
  ) then
    alter table public.tenants alter column phone_number drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'first_name'
  ) then
    alter table public.tenants alter column first_name drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'last_name'
  ) then
    alter table public.tenants alter column last_name drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'unit_id'
  ) then
    alter table public.tenants alter column unit_id drop not null;
  end if;
end $$;


-- 4. UNIT PHOTOS TABLE
create table if not exists public.unit_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz not null default now()
);


-- 5. UNIT MAINTENANCE NOTES TABLE
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


-- 6. FOREIGN KEYS ON TICKETS & INDEXES
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


-- 7. STORAGE BUCKET FOR UNIT PHOTOS
insert into storage.buckets (id, name, public)
values ('unit-photos', 'unit-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public unit photo access" on storage.objects;
create policy "Public unit photo access"
on storage.objects for select
using (bucket_id = 'unit-photos');

drop policy if exists "Authenticated unit photo uploads" on storage.objects;
create policy "Authenticated unit photo uploads"
on storage.objects for insert
with check (bucket_id = 'unit-photos');
