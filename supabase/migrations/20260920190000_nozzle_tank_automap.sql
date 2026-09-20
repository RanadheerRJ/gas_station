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
