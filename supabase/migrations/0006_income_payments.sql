-- Business income as a log of payments. Instead of retyping a monthly total,
-- each client payment is recorded and the stream's month total sums them.
-- Run once in the Supabase SQL editor (the whole file).

-- Mark a stream as built from logged payments (e.g. business revenue).
alter table public.income_sources add column if not exists track_payments boolean not null default false;

-- One row per payment received.
create table if not exists public.income_payments (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  date date not null,
  amount numeric not null default 0,
  note text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);
create index if not exists income_payments_user_date_idx on public.income_payments (user_id, date);

-- Row-level security: every payment is private to its owner.
alter table public.income_payments enable row level security;
drop policy if exists own_rows on public.income_payments;
create policy own_rows on public.income_payments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
