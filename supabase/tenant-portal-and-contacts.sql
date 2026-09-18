alter table public.tenants
  add column if not exists avatar_url text;

create table if not exists public.tenant_improvement_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.property_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  assignment_type text not null check (assignment_type in ('primary', 'secondary')),
  created_at timestamptz not null default now(),
  unique (property_id, staff_id)
);

create table if not exists public.approved_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  phone text,
  service_type text,
  notes text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_improvement_photos_tenant_idx
  on public.tenant_improvement_photos (tenant_id, created_at);
create index if not exists property_staff_assignments_property_idx
  on public.property_staff_assignments (property_id, assignment_type);
create index if not exists approved_vendors_name_idx
  on public.approved_vendors (name);

insert into storage.buckets (id, name, public)
values ('tenant-improvements', 'tenant-improvements', true)
on conflict (id) do nothing;

drop policy if exists "Public tenant improvement photo access" on storage.objects;
create policy "Public tenant improvement photo access"
on storage.objects for select
using (bucket_id = 'tenant-improvements');

drop policy if exists "Authenticated tenant improvement uploads" on storage.objects;
create policy "Authenticated tenant improvement uploads"
on storage.objects for insert
with check (bucket_id = 'tenant-improvements');
