create table if not exists public.property_announcements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  author_email text not null,
  body text not null,
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists property_announcements_property_created_idx
  on public.property_announcements (property_id, created_at desc);

create table if not exists public.property_announcement_replies (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.property_announcements(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  author_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists property_announcement_replies_announcement_created_idx
  on public.property_announcement_replies (announcement_id, created_at);

alter table public.property_announcements enable row level security;
alter table public.property_announcement_replies enable row level security;

insert into storage.buckets (id, name, public)
values ('property-announcements', 'property-announcements', true)
on conflict (id) do nothing;

drop policy if exists "Public property announcement images" on storage.objects;
create policy "Public property announcement images"
on storage.objects for select
using (bucket_id = 'property-announcements');

drop policy if exists "Authenticated property announcement image uploads" on storage.objects;
create policy "Authenticated property announcement image uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'property-announcements');
