alter table public.approved_vendors
  add column if not exists website text;

alter table public.approved_vendors
  add column if not exists address text,
  add column if not exists website_title text,
  add column if not exists website_description text,
  add column if not exists website_thumbnail_url text;
