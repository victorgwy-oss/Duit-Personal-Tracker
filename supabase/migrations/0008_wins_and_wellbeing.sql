-- The "wins" side of Duit: savings, investments and net worth (with automatic
-- monthly contributions such as an investment DCA), plus gentler-money
-- preferences (a "Just for me" fund and a past emergency to compare against).
-- Only ADDS new tables — nothing existing is changed. Safe to run more than
-- once. Until it's run, these features still work on each device; they just
-- don't sync between devices yet.

create table if not exists public.assets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('savings', 'investment', 'property', 'other', 'debt')),
  amount numeric not null default 0,
  as_of date not null,
  monthly_add numeric,
  add_day int,
  add_since date,
  in_safety_net boolean not null default false,
  group_name text,
  color text not null default '#22c55e',
  updated_at bigint not null default 0,
  deleted boolean not null default false
);

-- Added after the first version of this file: safe to (re-)run either way.
alter table public.assets add column if not exists group_name text;

create table if not exists public.wellbeing (
  user_id uuid primary key references auth.users (id) on delete cascade,
  for_me_monthly numeric not null default 0,
  for_me_category_id uuid,
  emergency_label text not null default '',
  emergency_amount numeric not null default 0,
  updated_at bigint not null default 0
);

-- Row-level security: private to each owner.
alter table public.assets    enable row level security;
alter table public.wellbeing enable row level security;

drop policy if exists own_rows on public.assets;
create policy own_rows on public.assets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_rows on public.wellbeing;
create policy own_rows on public.wellbeing for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
