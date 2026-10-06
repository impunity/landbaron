create table if not exists public.property_handbooks (
  property_id uuid primary key references public.properties(id) on delete cascade,
  body text not null default '' check (length(body) <= 100000),
  google_doc_url text,
  photo_url text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.property_handbooks
  add column if not exists photo_url text;

alter table public.property_handbooks enable row level security;
revoke all on public.property_handbooks from anon, authenticated;
grant select, insert, update, delete on public.property_handbooks to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-handbook-photos', 'property-handbook-photos', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public property handbook photo access" on storage.objects;
create policy "Public property handbook photo access"
on storage.objects for select
using (bucket_id = 'property-handbook-photos');