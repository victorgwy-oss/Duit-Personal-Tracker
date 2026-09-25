-- Allow every wallet type the app offers. 0001 only permitted 'ewallet' and
-- 'card', so Cash and Bank Transfer wallets were rejected and never reached the
-- cloud — other devices then couldn't tell which wallet those expenses (and
-- recurring charges like loans paid by bank transfer) belong to.
-- Safe to run more than once. Run once in the Supabase SQL editor.

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check check (type in ('ewallet', 'card', 'cash', 'bank'));
