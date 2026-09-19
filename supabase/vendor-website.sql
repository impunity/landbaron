alter table public.approved_vendors
  add column if not exists website text;
