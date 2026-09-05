-- Fix recurring double-posting. The auto-poster (here and in the client) used a
-- random UUID per posted charge and deduped by re-checking (recurring_id, date).
-- With two independent posters — the client on another device and this cron —
-- the "not exists" check races: both see no row and both insert, producing two
-- rows with different ids for the same charge.
--
-- Now the id is DETERMINISTIC: md5(rule_id || ':' || date). The client derives
-- the identical id (its vendored md5 matches Postgres md5), so a second insert
-- for the same occurrence collapses onto the same primary key via upsert instead
-- of duplicating. Run once in the Supabase SQL editor.
--
-- This migration only changes future posting behaviour. It deletes nothing — any
-- existing duplicates are left in place for you to review and remove yourself.

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
         and not exists (
           select 1 from public.transactions
           where recurring_id = r.id and date = occ and not deleted
         ) then
        insert into public.transactions (id, user_id, date, amount, account_id, category_id, note, source, recurring_id, reconciled, created_at, updated_at)
        values (
          md5(r.id::text || ':' || occ::text)::uuid,  -- deterministic, matches the client
          r.user_id, occ, r.amount, r.account_id, r.category_id, r.name, 'recurring', r.id, false,
          extract(epoch from now())*1000, extract(epoch from now())*1000
        )
        on conflict (id) do nothing;  -- another poster already recorded this exact charge
        inserted := inserted + 1;
      end if;
    end loop;
  end loop;
  return inserted;
end $$;
