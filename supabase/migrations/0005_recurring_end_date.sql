-- Optional end date for recurring charges (e.g. a 12-month 0% installment).
-- A rule with an end_date stops posting after it; NULL = repeats forever.
-- Run once in the Supabase SQL editor.

alter table public.recurring_rules add column if not exists end_date date;

-- Teach the auto-poster to stop at the end date. Same deterministic id as 0004.
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
         and (r.end_date is null or occ <= r.end_date)   -- stop after the end date
         and not exists (
           select 1 from public.transactions
           where recurring_id = r.id and date = occ and not deleted
         ) then
        insert into public.transactions (id, user_id, date, amount, account_id, category_id, note, source, recurring_id, reconciled, created_at, updated_at)
        values (
          md5(r.id::text || ':' || occ::text)::uuid,
          r.user_id, occ, r.amount, r.account_id, r.category_id, r.name, 'recurring', r.id, false,
          extract(epoch from now())*1000, extract(epoch from now())*1000
        )
        on conflict (id) do nothing;
        inserted := inserted + 1;
      end if;
    end loop;
  end loop;
  return inserted;
end $$;
