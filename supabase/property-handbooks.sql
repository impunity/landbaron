create table if not exists public.property_handbooks (
  property_id uuid primary key references public.properties(id) on delete cascade,
  body text not null default '' check (length(body) <= 100000),
  google_doc_url text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.property_handbooks enable row level security;
revoke all on public.property_handbooks from anon, authenticated;
grant select, insert, update, delete on public.property_handbooks to service_role;