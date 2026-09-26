-- Station Ledger: Reset whole station data RPC
--
-- Allows Owners (for their own stations) and Developers (for any station)
-- to purge all operational, equipment, and financial records for a station,
-- returning the station to a clean state ready for fresh setup.

create or replace function public.reset_station_data(p_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.account_role;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if not exists (select 1 from public.stations where id = p_station_id) then
    raise exception 'Station not found.' using errcode = 'P0002';
  end if;

  v_role := public.current_account_role();

  -- Developers (admin) can reset any station; Owners only their own stations.
  if public.is_admin() then
    null;
  elsif v_role = 'owner'::public.account_role then
    if not exists (
      select 1 from public.stations s
      where s.id = p_station_id and s.owner_id = auth.uid()
    ) then
      raise exception 'Owner access to this station is required.' using errcode = '42501';
    end if;
  else
    raise exception 'Owner or developer access is required to reset station data.' using errcode = '42501';
  end if;

  -- Delete in reverse dependency order:
  -- 1. Customer transactions (financial ledger entries)
  delete from public.customer_transactions where station_id = p_station_id;

  -- 2. Credit customers (created_from_shift or standalone)
  delete from public.credit_customers where station_id = p_station_id;

  -- 3. Shift expenses (linked to shifts)
  delete from public.shift_expenses
  where shift_id in (select s.id from public.shifts s where s.station_id = p_station_id);

  -- 4. Shift nozzles (linked to shifts, nozzles, pumps, fuel_prices)
  delete from public.shift_nozzles where station_id = p_station_id;

  -- 5. Stock movements (deliveries / reconciliations, if table exists)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'stock_movements'
  ) then
    execute 'delete from public.stock_movements where station_id = $1' using p_station_id;
  end if;

  -- 6. Tank readings (dips)
  delete from public.tank_readings where station_id = p_station_id;

  -- 7. Shifts
  delete from public.shifts where station_id = p_station_id;

  -- 8. Fuel prices
  delete from public.fuel_prices where station_id = p_station_id;

  -- 9. Nozzles
  delete from public.nozzles where station_id = p_station_id;

  -- 10. Pumps
  delete from public.pumps where station_id = p_station_id;

  -- 11. Tanks
  delete from public.tanks where station_id = p_station_id;
end;
$$;

comment on function public.reset_station_data(uuid) is
  'Clears all operational, equipment, stock, and credit data for a station. Restricted to the station owner or a developer/admin.';

revoke execute on function public.reset_station_data(uuid) from public;
grant execute on function public.reset_station_data(uuid) to authenticated;
