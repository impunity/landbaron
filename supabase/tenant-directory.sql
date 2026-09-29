alter table public.tenants
  add column if not exists instagram_handle text;

alter table public.tenants
  add column if not exists share_contact_info boolean not null default true;
