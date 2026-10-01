create table if not exists public.property_announcement_reactions (
  announcement_id uuid not null references public.property_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('up', 'down', 'heart', 'hundred', 'shrug')),
  primary key (announcement_id, user_id)
);

alter table public.property_announcement_replies
  add column if not exists mentions jsonb not null default '[]'::jsonb;

alter table public.property_announcement_reactions enable row level security;