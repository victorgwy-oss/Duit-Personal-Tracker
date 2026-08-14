-- Granular income: multiple streams (salary, rental, business, …), each with a
-- default monthly amount and optional per-month overrides for streams that
-- fluctuate. Run once in the Supabase SQL editor after 0002.

create table if not exists public.income_sources (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  default_amount numeric not null default 0,
  color text not null default '#22c55e',
  active boolean not null default true,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);

create table if not exists public.income_overrides (
  id text primary key, -- "<source_id>:<yyyy-mm>"
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  month_key text not null, -- cycle key, e.g. "2026-08"
  amount numeric not null default 0,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);
create index if not exists income_overrides_user_idx on public.income_overrides (user_id, month_key);

-- Row-level security: every row is private to its owner.
alter table public.income_sources   enable row level security;
alter table public.income_overrides enable row level security;

do $$
declare t text;
begin
  foreach t in array array['income_sources','income_overrides'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
