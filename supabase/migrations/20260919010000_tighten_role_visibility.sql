-- Station Ledger: production-safe RBAC tightening.
--
-- The initial migration gave every account attached to a station the same
-- read surface. That is too wide: a developer account could read operational
-- data, and an attendant could read the whole station's shifts, payments,
-- credit ledger, fuel-price history, and tank stock.
--
-- This follow-up narrows the boundary to the documented role matrix. It is a
-- separate migration on purpose — the initial one is already applied in
-- production and must not be rewritten.
--
--   developer/admin : account provisioning only, no station operational data
--   owner           : everything for the stations they own
--   manager         : operational and financial data for their station
--   attendant       : their own shift records, plus the station/pump/nozzle
--                     availability needed to start a shift — and nothing else
--
-- Route guards and hidden buttons are not a security boundary. Everything
-- below is enforced by row-level security, SECURITY DEFINER RPCs, and row
-- triggers, so a hand-written PostgREST or RPC call is refused too.

/* ------------------------------------------------------------------ */
/* 1. Access predicates                                                */
/* ------------------------------------------------------------------ */

-- Developers provision accounts; they are deliberately no longer treated as
-- having access to any station's operational data.
create or replace function public.can_access_station(p_station_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stations s
    join public.profiles p on p.id = auth.uid()
    where s.id = p_station_id
      and (s.owner_id = p.id or p.station_id = s.id)
  )
$$;

comment on function public.can_access_station(uuid) is
  'True when the caller is the station owner or is posted to the station. Developers are excluded: provisioning does not imply data access.';

-- Financial and stock data is owner/manager only. Attendants are attached to
-- the station but are not allowed to read the station's money or stock.
create or replace function public.can_manage_station(p_station_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stations s
    join public.profiles p on p.id = auth.uid()
    where s.id = p_station_id
      and p.role in ('owner'::public.account_role, 'manager'::public.account_role)
      and (s.owner_id = p.id or p.station_id = s.id)
  )
$$;

comment on function public.can_manage_station(uuid) is
  'True for the owner of the station or the manager posted to it. Gates financial, credit, price-history, and stock data.';

create or replace function public.assert_manager_station(p_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if not public.can_manage_station(p_station_id) then
    raise exception 'Only an owner or manager can do that.' using errcode = '42501';
  end if;
end;
$$;

-- Used by both the RPC layer and the row triggers so "is this my shift?" has
-- exactly one definition.
create or replace function public.assert_own_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
begin
  select employee_id into v_employee_id from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if v_employee_id is distinct from auth.uid() then
    raise exception 'You can only work on your own shift.' using errcode = '42501';
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* 2. Row-level security                                               */
/* ------------------------------------------------------------------ */

-- Stations, pumps, and nozzles stay readable to everyone posted to the
-- station: an attendant cannot start a shift without seeing the equipment.
-- Everything that carries money, identity, or stock is narrowed below.

drop policy if exists prices_read on public.fuel_prices;
create policy prices_read on public.fuel_prices
  for select to authenticated
  using (public.can_manage_station(station_id));

-- An attendant sees their own shifts and nothing else. Co-workers' shifts,
-- readings, payments, and expenses stay invisible.
drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts
  for select to authenticated
  using (
    public.can_manage_station(station_id)
    or (employee_id = auth.uid() and public.can_access_station(station_id))
  );

drop policy if exists shift_nozzles_read on public.shift_nozzles;
create policy shift_nozzles_read on public.shift_nozzles
  for select to authenticated
  using (
    public.can_manage_station(station_id)
    or exists (
      select 1 from public.shifts s
      where s.id = shift_id and s.employee_id = auth.uid()
    )
  );

drop policy if exists shift_expenses_read on public.shift_expenses;
create policy shift_expenses_read on public.shift_expenses
  for select to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id
        and (public.can_manage_station(s.station_id) or s.employee_id = auth.uid())
    )
  );

drop policy if exists customers_read on public.credit_customers;
create policy customers_read on public.credit_customers
  for select to authenticated
  using (public.can_manage_station(station_id));

drop policy if exists customer_transactions_read on public.customer_transactions;
create policy customer_transactions_read on public.customer_transactions
  for select to authenticated
  using (public.can_manage_station(station_id));

drop policy if exists tanks_read on public.tanks;
create policy tanks_read on public.tanks
  for select to authenticated
  using (public.can_manage_station(station_id));

drop policy if exists tank_readings_read on public.tank_readings;
create policy tank_readings_read on public.tank_readings
  for select to authenticated
  using (public.can_manage_station(station_id));

/* ------------------------------------------------------------------ */
/* 3. Anonymous nozzle availability                                    */
/* ------------------------------------------------------------------ */

-- An attendant needs to know which nozzles are already taken, but must not
-- learn who is on them. This returns busy nozzle ids only — no shift id, no
-- employee, no readings, no money.
create or replace function public.list_nozzle_occupancy(p_station_id uuid)
returns table (nozzle_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_station_access(p_station_id);
  return query
    select sn.nozzle_id
    from public.shift_nozzles sn
    where sn.station_id = p_station_id
      and sn.is_open;
end;
$$;

comment on function public.list_nozzle_occupancy(uuid) is
  'Busy nozzle ids for a station. Deliberately anonymous so attendants can see availability without seeing who holds a nozzle.';

/* ------------------------------------------------------------------ */
/* 4. Row triggers: the backstop for direct RPC calls                  */
/* ------------------------------------------------------------------ */

-- Every mutation RPC is SECURITY DEFINER, so RLS does not apply inside it.
-- These row triggers do fire, which makes them the last line of defence if a
-- future RPC forgets a role check or an attendant calls one by hand.
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

  -- credit_customers, customer_transactions, tanks, tank_readings,
  -- fuel_prices: entirely out of bounds for an attendant.
  raise exception 'Attendants cannot change % records.', replace(tg_table_name, '_', ' ')
    using errcode = '42501';
end;
$$;

comment on function public.guard_attendant_writes() is
  'Row-level backstop: attendants may only touch their own shift rows, and never credit, price, or stock records.';

drop trigger if exists shifts_guard_attendant on public.shifts;
create trigger shifts_guard_attendant
before insert or update or delete on public.shifts
for each row execute function public.guard_attendant_writes();

drop trigger if exists shift_nozzles_guard_attendant on public.shift_nozzles;
create trigger shift_nozzles_guard_attendant
before insert or update or delete on public.shift_nozzles
for each row execute function public.guard_attendant_writes();

drop trigger if exists shift_expenses_guard_attendant on public.shift_expenses;
create trigger shift_expenses_guard_attendant
before insert or update or delete on public.shift_expenses
for each row execute function public.guard_attendant_writes();

drop trigger if exists credit_customers_guard_attendant on public.credit_customers;
create trigger credit_customers_guard_attendant
before insert or update or delete on public.credit_customers
for each row execute function public.guard_attendant_writes();

drop trigger if exists customer_transactions_guard_attendant on public.customer_transactions;
create trigger customer_transactions_guard_attendant
before insert or update or delete on public.customer_transactions
for each row execute function public.guard_attendant_writes();

drop trigger if exists tanks_guard_attendant on public.tanks;
create trigger tanks_guard_attendant
before insert or update or delete on public.tanks
for each row execute function public.guard_attendant_writes();

drop trigger if exists tank_readings_guard_attendant on public.tank_readings;
create trigger tank_readings_guard_attendant
before insert or update or delete on public.tank_readings
for each row execute function public.guard_attendant_writes();

drop trigger if exists fuel_prices_guard_attendant on public.fuel_prices;
create trigger fuel_prices_guard_attendant
before insert or update or delete on public.fuel_prices
for each row execute function public.guard_attendant_writes();

/* ------------------------------------------------------------------ */
/* 5. RPC role checks                                                  */
/* ------------------------------------------------------------------ */

-- Shift expenses belong to the operator running the shift. A manager or owner
-- may correct any shift at their station; an attendant only their own.
create or replace function public.add_shift_expense(p_station_id uuid, p_shift_id uuid, p_label text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_station_access(p_station_id);
  if not public.can_manage_station(p_station_id) then
    perform public.assert_own_shift(p_shift_id);
  end if;
  perform 1 from public.shifts where id = p_shift_id and station_id = p_station_id and status = 'open' for update;
  if not found then raise exception 'This shift is already closed or missing.' using errcode = '55000'; end if;
  if char_length(btrim(p_label)) not between 1 and 80 or p_amount is null or p_amount <= 0 then
    raise exception 'Enter an expense label and amount greater than zero.' using errcode = '22023';
  end if;
  insert into public.shift_expenses (shift_id, label, amount) values (p_shift_id, btrim(p_label), p_amount);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_shift_expense(p_station_id uuid, p_shift_id uuid, p_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_expense_id uuid;
begin
  perform public.assert_station_access(p_station_id);
  if not public.can_manage_station(p_station_id) then
    perform public.assert_own_shift(p_shift_id);
  end if;
  perform 1 from public.shifts where id = p_shift_id and station_id = p_station_id and status = 'open' for update;
  if not found then raise exception 'This shift is already closed or missing.' using errcode = '55000'; end if;
  if p_index is null or p_index < 0 then raise exception 'Expense not found.' using errcode = '22023'; end if;
  select id into v_expense_id from public.shift_expenses
  where shift_id = p_shift_id order by occurred_at, id offset p_index limit 1;
  if v_expense_id is null then raise exception 'Expense not found.' using errcode = 'P0002'; end if;
  delete from public.shift_expenses where id = v_expense_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- The credit ledger is financial data: owner and manager only.
create or replace function public.create_customer(p_station_id uuid, p_name text, p_phone text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.credit_customers;
begin
  perform public.assert_manager_station(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  if char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;
  insert into public.credit_customers (station_id, name, phone)
  values (p_station_id, btrim(p_name), btrim(coalesce(p_phone, ''))) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.record_customer_transaction(
  p_station_id uuid,
  p_customer_id uuid,
  p_type text,
  p_amount numeric,
  p_note text default '',
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_customer public.credit_customers; v_profile public.profiles; v_delta numeric;
begin
  perform public.assert_manager_station(p_station_id);
  if p_type not in ('credit', 'payment') or p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid transaction and amount greater than zero.' using errcode = '22023';
  end if;
  select * into v_customer from public.credit_customers
  where id = p_customer_id and station_id = p_station_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
  if p_type = 'payment' and p_amount > v_customer.outstanding_balance then
    raise exception 'That is more than the % outstanding on this account.', v_customer.outstanding_balance using errcode = '55000';
  end if;
  v_delta := case when p_type = 'credit' then p_amount else -p_amount end;
  select * into v_profile from public.profiles where id = auth.uid();
  update public.credit_customers
  set outstanding_balance = outstanding_balance + v_delta
  where id = p_customer_id
  returning * into v_customer;
  insert into public.customer_transactions (
    station_id, customer_id, transaction_date, type, amount, note, recorded_by, recorded_by_name
  ) values (
    p_station_id, p_customer_id, coalesce(p_date, current_date), p_type, p_amount,
    btrim(coalesce(p_note, '')), auth.uid(), coalesce(v_profile.name, '')
  );
  return jsonb_build_object('ok', true, 'outstandingBalance', v_customer.outstanding_balance);
end;
$$;

-- Ground stock is likewise owner/manager only.
create or replace function public.record_dip(
  p_station_id uuid, p_tank_id uuid, p_stock_litres numeric, p_temperature_c numeric, p_water_cm numeric default null, p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tank public.tanks; v_profile public.profiles; v_now timestamptz := now();
begin
  perform public.assert_manager_station(p_station_id);
  if p_stock_litres is null or p_stock_litres < 0 or p_temperature_c is null or p_temperature_c < 5 or p_temperature_c > 55 then
    raise exception 'Enter a plausible stock and temperature reading.' using errcode = '22023';
  end if;
  select * into v_tank from public.tanks where id = p_tank_id and station_id = p_station_id for update;
  if not found then raise exception 'Tank not found.' using errcode = 'P0002'; end if;
  if v_tank.state = 'retired'::public.asset_state then raise exception 'This tank is out of service.' using errcode = '55000'; end if;
  if p_stock_litres > v_tank.capacity then raise exception 'Stock is more than the tank holds.' using errcode = '22023'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  insert into public.tank_readings (station_id, tank_id, kind, stock_litres, previous_stock, change, temperature_c, water_cm, note, recorded_by, recorded_by_name, recorded_at)
  values (p_station_id, p_tank_id, 'dip', p_stock_litres, v_tank.current_stock, round(p_stock_litres - v_tank.current_stock, 2), p_temperature_c, p_water_cm, btrim(coalesce(p_note, '')), auth.uid(), coalesce(v_profile.name, ''), v_now);
  update public.tanks set current_stock = p_stock_litres, temperature_c = p_temperature_c, water_cm = p_water_cm, last_dip_at = v_now, last_dip_by = coalesce(v_profile.name, '') where id = p_tank_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.record_delivery(
  p_station_id uuid, p_tank_id uuid, p_litres numeric, p_temperature_c numeric, p_invoice text default '', p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tank public.tanks; v_profile public.profiles; v_now timestamptz := now(); v_after numeric;
begin
  perform public.assert_manager_station(p_station_id);
  if p_litres is null or p_litres <= 0 or p_temperature_c is null or p_temperature_c < 5 or p_temperature_c > 55 then
    raise exception 'Enter a plausible delivery quantity and temperature.' using errcode = '22023';
  end if;
  select * into v_tank from public.tanks where id = p_tank_id and station_id = p_station_id for update;
  if not found then raise exception 'Tank not found.' using errcode = 'P0002'; end if;
  if v_tank.state = 'retired'::public.asset_state then raise exception 'This tank is out of service.' using errcode = '55000'; end if;
  v_after := v_tank.current_stock + p_litres;
  if v_after > v_tank.capacity then raise exception '% L would overfill the tank.', p_litres using errcode = '55000'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  insert into public.tank_readings (station_id, tank_id, kind, stock_litres, previous_stock, change, temperature_c, water_cm, invoice, note, recorded_by, recorded_by_name, recorded_at)
  values (p_station_id, p_tank_id, 'delivery', v_after, v_tank.current_stock, p_litres, p_temperature_c, v_tank.water_cm, btrim(coalesce(p_invoice, '')), btrim(coalesce(p_note, '')), auth.uid(), coalesce(v_profile.name, ''), v_now);
  update public.tanks set current_stock = v_after, temperature_c = p_temperature_c, last_dip_at = v_now, last_dip_by = coalesce(v_profile.name, '') where id = p_tank_id;
  return jsonb_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------------ */
/* 6. Grants                                                           */
/* ------------------------------------------------------------------ */

-- New functions are created with EXECUTE granted to PUBLIC by default, which
-- would expose them to the anonymous key. Take that back before handing the
-- narrow set to signed-in users. CREATE OR REPLACE on the pre-existing
-- functions keeps their original grants.
revoke execute on function
  public.can_manage_station(uuid),
  public.assert_manager_station(uuid),
  public.assert_own_shift(uuid),
  public.list_nozzle_occupancy(uuid),
  public.guard_attendant_writes()
from public, anon, authenticated;

grant execute on function
  public.can_manage_station(uuid),
  public.list_nozzle_occupancy(uuid)
to authenticated;
