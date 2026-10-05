create table if not exists public.legal_disclosures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null check (content_type in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists legal_disclosures_organization_created_idx
  on public.legal_disclosures (organization_id, created_at desc);

alter table public.legal_disclosures enable row level security;
revoke all on public.legal_disclosures from anon, authenticated;
grant select, insert, delete on public.legal_disclosures to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-disclosures',
  'legal-disclosures',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
