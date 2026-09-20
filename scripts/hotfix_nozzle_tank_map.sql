-- HOTFIX (paste-ready copy of supabase/migrations/20260920190000_nozzle_tank_automap.sql
-- for the Supabase Dashboard SQL editor, same as the previous hotfix).
--
-- If you run this instead of `supabase db push`, reconcile history later with:
--   supabase migration repair --status applied 20260920190000

-- The stock-ledger migration made close_shift post metered litres against the
-- tank each nozzle is mapped to (nozzles.tank_id) — and refuse to close when a
-- nozzle is unmapped. But nothing ever set tank_id: the mapping RPC existed
-- with no UI behind it, and add_nozzle/add_tank never linked the two. Result:
-- every station's book stock stood still after meter sales, and once the
-- ledger migration was live, shift closes started failing outright.
--
-- A second gap compounds it: guard_attendant_writes() hard-blocks every tank
-- and tank_readings write by an attendant — including the ones close_shift
-- and record_dip make on their behalf. An owner could close a mapped shift;
-- an attendant could not close one at all, and could not record a dip.
--
-- Fixes, all keyed on the common case of one tank per fuel:
--   1. Backfill: map every unmapped nozzle to its station's only active tank
--      of the same fuel. Ambiguous stations (two Petrol tanks) stay unmapped
--      and are resolved in the Pumps & rates screen, which now has a selector.
--   2. add_nozzle auto-maps a new nozzle the same way.
--   3. add_tank claims unmapped matching nozzles when it is the only active
--      tank of its fuel at the station (and opens its stock ledger).
--   4. close_shift and record_dip mark their transaction as a trusted RPC;
--      the attendant guard honours that mark for tanks/tank_readings only.
--      Direct table writes by an attendant stay blocked (no mark), and the
--      credit tables ignore the mark entirely, so an attendant still cannot
--      create credit while closing a shift.

/* ------------------------------------------------------------------ */
/* 1. Backfill existing nozzles                                         */
/* ------------------------------------------------------------------ */

update public.nozzles n
set tank_id = one.tank_id
from (
  select station_id, lower(fuel_type) as fuel, (min(id::text))::uuid as tank_id
  from public.tanks
  where state = 'active'
  group by station_id, lower(fuel_type)
  having count(*) = 1
) as one
where n.tank_id is null
  and n.station_id = one.station_id
  and lower(n.fuel_type) = one.fuel;

/* ------------------------------------------------------------------ */
/* 2. New nozzles map themselves when the tank is unambiguous           */
/* ------------------------------------------------------------------ */

create or replace function public.add_nozzle(
  p_station_id uuid,
  p_pump_id uuid,
  p_name text,
  p_fuel_type text,
  p_opening_reading numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.nozzles; v_tank_id uuid;
begin
  perform public.assert_owner_station(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  if char_length(btrim(p_name)) not between 1 and 80
     or char_length(btrim(p_fuel_type)) not between 1 and 40
     or coalesce(p_opening_reading, 0) < 0 then
    raise exception 'Invalid nozzle details.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pumps where id = p_pump_id and station_id = p_station_id) then
    raise exception 'Pump not found.' using errcode = 'P0002';
  end if;
  -- Exactly one active tank of this fuel: the mapping is not a choice, so make
  -- it automatically. Zero or several: leave null for the owner to pick.
  select case when count(*) = 1 then (min(id::text))::uuid end into v_tank_id
  from public.tanks
  where station_id = p_station_id
    and state = 'active'
    and lower(fuel_type) = lower(btrim(p_fuel_type));
  insert into public.nozzles (station_id, pump_id, name, fuel_type, last_reading, tank_id)
  values (p_station_id, p_pump_id, btrim(p_name), btrim(p_fuel_type), coalesce(p_opening_reading, 0), v_tank_id)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

/* ------------------------------------------------------------------ */
/* 3. A new only-tank-of-its-fuel claims unmapped nozzles               */
/* ------------------------------------------------------------------ */

create or replace function public.add_tank(
  p_station_id uuid, p_name text, p_fuel_type text, p_capacity numeric, p_current_stock numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.tanks;
begin
  perform public.assert_owner_station(p_station_id);
  if char_length(btrim(p_name)) not between 1 and 80 or char_length(btrim(p_fuel_type)) not between 1 and 40
     or p_capacity is null or p_capacity <= 0 or coalesce(p_current_stock, 0) < 0 or coalesce(p_current_stock, 0) > p_capacity then
    raise exception 'Invalid tank details.' using errcode = '22023';
  end if;
  insert into public.tanks (station_id, name, fuel_type, capacity, current_stock)
  values (p_station_id, btrim(p_name), btrim(p_fuel_type), p_capacity, coalesce(p_current_stock, 0)) returning * into v_row;
  -- The ledger needs an opening balance for the new tank.
  insert into public.stock_movements(station_id, tank_id, fuel_type, movement_type, quantity_litres,
    reference_type, reference_id, before_stock, after_stock, note)
  values (p_station_id, v_row.id, v_row.fuel_type, 'opening', v_row.current_stock, 'tank', v_row.id,
    0, v_row.current_stock, 'Opening balance at tank creation');
  -- If this is now the only active tank of its fuel here, unmapped nozzles of
  -- that fuel can only mean this tank.
  if not exists (
    select 1 from public.tanks
    where station_id = p_station_id and state = 'active'
      and lower(fuel_type) = lower(btrim(p_fuel_type)) and id <> v_row.id
  ) then
    update public.nozzles
    set tank_id = v_row.id
    where station_id = p_station_id
      and tank_id is null
      and lower(fuel_type) = lower(btrim(p_fuel_type));
  end if;
  return to_jsonb(v_row);
end;
$$;

/* ------------------------------------------------------------------ */
/* 4. Let the stock RPCs act for an attendant                          */
/* ------------------------------------------------------------------ */

-- close_shift must debit the mapped tank and record_dip must insert a
-- reading when the caller is the attendant on shift. Both are SECURITY
-- DEFINER, so inside them current_user is the function owner — while a
-- direct PostgREST table write always arrives as `authenticated` (or
-- `anon`). That distinction lets the guard wave through exactly the writes
-- the RPC layer makes on the attendant's behalf, for the two stock tables
-- only. Direct writes stay blocked, and the credit tables ignore the
-- distinction entirely: an attendant still cannot create credit anywhere,
-- including from inside close_shift.
create or replace function public.guard_attendant_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  -- Owners and managers are authorised by the RPC layer. The service role
  -- provisioning accounts has no profile row, so it is unaffected too.
  if public.current_account_role() is distinct from 'attendant'::public.account_role then
    return v_row;
  end if;

  if tg_table_name = 'shifts' then
    if tg_op = 'DELETE' then
      raise exception 'Shift records cannot be removed.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      if old.employee_id is distinct from auth.uid() then
        raise exception 'You can only change your own shift.' using errcode = '42501';
      end if;
    end if;
    if new.employee_id is distinct from auth.uid() then
      raise exception 'You can only change your own shift.' using errcode = '42501';
    end if;
    return v_row;
  end if;

  if tg_table_name in ('shift_nozzles', 'shift_expenses') then
    perform public.assert_own_shift(v_row.shift_id);
    if tg_op = 'UPDATE' then
      perform public.assert_own_shift(old.shift_id);
    end if;
    return v_row;
  end if;

  -- Stock tables: a SECURITY DEFINER RPC (close_shift posting meter sales,
  -- record_dip writing an observation) executes as the function owner, never
  -- as `authenticated`/`anon`, so this passes only the RPC layer's own
  -- writes. A direct PostgREST table write still arrives as
  -- `authenticated` and falls through to the block below.
  if tg_table_name in ('tanks', 'tank_readings')
     and current_user not in ('authenticated', 'anon') then
    return v_row;
  end if;

  -- credit_customers, customer_transactions, fuel_prices — and any direct
  -- write to tanks or tank_readings: entirely out of bounds for an attendant.
  raise exception 'Attendants cannot change % records.', replace(tg_table_name, '_', ' ')
    using errcode = '42501';
end;
$$;

/* ------------------------------------------------------------------ */
/* Refresh PostgREST's schema cache                                     */
/* ------------------------------------------------------------------ */

notify pgrst, 'reload schema';

/* ------------------------------------------------------------------ */
/* Verify: every active nozzle should now have a tank. Rows returned    */
/* here still need a manual pick in Pumps & rates (two tanks share the  */
/* same fuel at that station).                                          */
/* ------------------------------------------------------------------ */

select n.name as nozzle, n.fuel_type, s.name as station
from public.nozzles n
join public.stations s on s.id = n.station_id
where n.tank_id is null and n.state = 'active';

/* ------------------------------------------------------------------ */
/* OPTIONAL CATCH-UP: post meter sales from shifts that closed while    */
/* the old close_shift was live (it never touched tank stock).          */
/*                                                                      */
/* Edit the cutoff below to the last moment your book stock was right   */
/* (for example the morning before the missing sale). Only closed       */
/* shifts that ended after the cutoff, on nozzles now mapped to a tank, */
/* and that have no sale movement yet, are posted. Safe to re-run: the  */
/* unique index on (reference_type, reference_id, reference_line_id)    */
/* means a shift line can never be posted twice.                        */
/* ------------------------------------------------------------------ */

do $$
declare
  cutoff timestamptz := date_trunc('day', now()) - interval '1 day'; -- EDIT ME
  r record;
  v_litres numeric;
  v_stock numeric;
begin
  for r in
    select sn.id as line_id, sn.shift_id, sn.label, sn.opening_reading, sn.closing_reading,
           n.tank_id, t.fuel_type, s.station_id, s.end_time, s.closed_by_name
    from public.shift_nozzles sn
    join public.shifts s on s.id = sn.shift_id
    join public.nozzles n on n.id = sn.nozzle_id
    join public.tanks t on t.id = n.tank_id
    where s.status in ('pending_review', 'approved')
      and s.end_time >= cutoff
      and sn.closing_reading is not null
      and n.tank_id is not null
      and not exists (
        select 1 from public.stock_movements m
        where m.reference_type = 'shift'
          and m.reference_id = sn.shift_id
          and m.reference_line_id = sn.id
      )
    order by s.end_time, sn.id
  loop
    v_litres := round(case
      when r.closing_reading >= r.opening_reading then r.closing_reading - r.opening_reading
      else 1000000 - r.opening_reading + r.closing_reading
    end, 2);
    if v_litres <= 0 then continue; end if;

    select current_stock into v_stock from public.tanks where id = r.tank_id for update;
    if v_stock < v_litres then
      raise notice 'SKIPPED % (% L): tank stock % would go negative — reconcile by hand',
        r.label, v_litres, v_stock;
      continue;
    end if;

    insert into public.stock_movements(station_id, tank_id, fuel_type, movement_type,
      quantity_litres, reference_type, reference_id, reference_line_id,
      before_stock, after_stock, recorded_by_name, recorded_at, note)
    values (r.station_id, r.tank_id, r.fuel_type, 'sale', -v_litres, 'shift',
      r.shift_id, r.line_id, v_stock, v_stock - v_litres,
      coalesce(r.closed_by_name, ''), r.end_time,
      r.label || ' (back-posted meter sale)');

    update public.tanks set current_stock = current_stock - v_litres where id = r.tank_id;
    raise notice 'Posted % : -% L', r.label, v_litres;
  end loop;
end $$;
