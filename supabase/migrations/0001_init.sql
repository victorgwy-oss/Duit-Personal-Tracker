-- Duit finance tracker — Supabase schema, row-level security, and the
-- server-side recurring auto-poster. Paste this into the Supabase SQL editor
-- (or run via the Supabase CLI) once, on a fresh project.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('ewallet', 'card')),
  color text not null default '#3b82f6',
  archived boolean not null default false,
  updated_at bigint not null default 0
);

create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  "group" text not null check ("group" in ('fixed', 'discretionary', 'other')),
  monthly_budget numeric not null default 0,
  color text not null default '#94a3b8',
  icon text not null default '❓',
  archived boolean not null default false,
  updated_at bigint not null default 0
);

create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount numeric not null,
  account_id uuid not null,
  category_id uuid not null,
  note text not null default '',
  source text not null default 'manual' check (source in ('manual', 'recurring', 'import')),
  recurring_id uuid,
  reconciled boolean not null default false,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date);
create index if not exists transactions_recurring_idx on public.transactions (recurring_id);

create table if not exists public.recurring_rules (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  amount numeric not null,
  account_id uuid not null,
  category_id uuid not null,
  cadence text not null check (cadence in ('weekly', 'monthly', 'annual')),
  day_of_month int not null default 1,
  start_date date not null,
  active boolean not null default true,
  mode text not null default 'auto' check (mode in ('auto', 'confirm')),
  last_posted_period text,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_income numeric not null default 0,
  savings_target numeric not null default 3000,
  currency text not null default 'RM',
  cycle_start_day int not null default 1,
  onboarded boolean not null default false,
  updated_at bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- Row-level security: every row is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.accounts        enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.settings        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','recurring_rules'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists own_settings on public.settings;
create policy own_settings on public.settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Server-side recurring auto-poster (backstop for when the app is closed).
-- Inserts any due 'auto' occurrence that isn't already recorded. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.post_due_recurring()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  occ date;
  dates date[];
  inserted int := 0;
begin
  for r in select * from public.recurring_rules where active and not deleted and mode = 'auto' loop
    -- Build the set of dates this rule should have fired on, up to today.
    if r.cadence = 'weekly' then
      dates := array(
        select d::date
        from generate_series(r.start_date, current_date, interval '1 day') g(d)
        where extract(dow from d::date) = (r.day_of_month % 7)
      );
    elsif r.cadence = 'monthly' then
      dates := array(
        select (date_trunc('month', m)::date
                + (least(r.day_of_month,
                         extract(day from (date_trunc('month', m) + interval '1 month - 1 day'))::int) - 1))
        from generate_series(date_trunc('month', r.start_date), date_trunc('month', current_date), interval '1 month') g(m)
      );
    else -- annual
      dates := array(
        select make_date(y::int, extract(month from r.start_date)::int,
                         least(extract(day from r.start_date)::int,
                               extract(day from (make_date(y::int, extract(month from r.start_date)::int, 1) + interval '1 month - 1 day'))::int))
        from generate_series(extract(year from r.start_date)::int, extract(year from current_date)::int) g(y)
      );
    end if;

    foreach occ in array dates loop
      if occ >= r.start_date and occ <= current_date
         and not exists (
           select 1 from public.transactions
           where recurring_id = r.id and date = occ and not deleted
         ) then
        insert into public.transactions (id, user_id, date, amount, account_id, category_id, note, source, recurring_id, reconciled, created_at, updated_at)
        values (gen_random_uuid(), r.user_id, occ, r.amount, r.account_id, r.category_id, r.name, 'recurring', r.id, false,
                extract(epoch from now())*1000, extract(epoch from now())*1000);
        inserted := inserted + 1;
      end if;
    end loop;
  end loop;
  return inserted;
end $$;

-- ---------------------------------------------------------------------------
-- Schedule the auto-poster daily at 01:00 UTC via pg_cron.
-- (Enable the extension first in Dashboard → Database → Extensions: pg_cron.)
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- select cron.schedule('duit-recurring', '0 1 * * *', $$select public.post_due_recurring();$$);
