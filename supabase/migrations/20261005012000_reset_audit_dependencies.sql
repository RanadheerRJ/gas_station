-- Keep reset_station_data compatible with the audit tables added after the
-- original reset RPC. A confirmed station reset is a full operational purge,
-- so dependent audit rows must be removed before their protected parents.

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

  if public.is_admin() then
    null;
  elsif v_role = 'owner'::public.account_role then
    if not exists (
      select 1
      from public.stations s
      where s.id = p_station_id and s.owner_id = auth.uid()
    ) then
      raise exception 'Owner access to this station is required.' using errcode = '42501';
    end if;
  else
    raise exception 'Owner or developer access is required to reset station data.'
      using errcode = '42501';
  end if;

  -- Audit rows use ON DELETE RESTRICT intentionally during normal operation.
  -- A station reset is the one explicit purge path, so remove them first.
  delete from public.customer_transaction_audit where station_id = p_station_id;
  delete from public.customer_audit where station_id = p_station_id;

  delete from public.customer_transactions where station_id = p_station_id;
  delete from public.credit_customers where station_id = p_station_id;

  delete from public.shift_expenses
  where shift_id in (
    select s.id from public.shifts s where s.station_id = p_station_id
  );
  delete from public.shift_nozzles where station_id = p_station_id;
  delete from public.stock_movements where station_id = p_station_id;
  delete from public.tank_readings where station_id = p_station_id;
  delete from public.shifts where station_id = p_station_id;
  delete from public.fuel_prices where station_id = p_station_id;
  delete from public.nozzles where station_id = p_station_id;
  delete from public.pumps where station_id = p_station_id;
  delete from public.tanks where station_id = p_station_id;
end;
$$;

comment on function public.reset_station_data(uuid) is
  'Clears all operational, equipment, stock, credit, and related audit data for a station. Restricted to the station owner or a developer/admin.';

revoke execute on function public.reset_station_data(uuid) from public;
grant execute on function public.reset_station_data(uuid) to authenticated;
