-- Station Ledger: Supabase schema, access controls, and transactional RPCs.
--
-- This migration deliberately keeps all money, meter, stock, and shift state
-- transitions inside PostgreSQL functions. Browser clients only receive the
-- anonymous key and are not granted table mutation privileges.

create extension if not exists pgcrypto;

create type public.account_role as enum ('admin', 'owner', 'manager', 'attendant');
create type public.station_state as enum ('active', 'archived');
create type public.asset_state as enum ('active', 'retired');
create type public.shift_status as enum ('open', 'pending_review', 'rejected', 'approved');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text,
  username text unique,
  role public.account_role not null,
  owner_id uuid,
  station_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'owner' and owner_id = id and station_id is null) or role <> 'owner')
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  owner_id uuid not null references public.profiles(id),
  state public.station_state not null default 'active',
  state_changed_by uuid references public.profiles(id),
  state_changed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_owner_id_fkey foreign key (owner_id) references public.profiles(id) deferrable initially deferred,
  add constraint profiles_station_id_fkey foreign key (station_id) references public.stations(id) deferrable initially deferred;

create table public.pumps (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  state public.asset_state not null default 'active',
  created_at timestamptz not null default now()
);

create table public.nozzles (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  pump_id uuid not null references public.pumps(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  fuel_type text not null check (char_length(btrim(fuel_type)) between 1 and 40),
  last_reading numeric(14,2) not null default 0 check (last_reading >= 0),
  state public.asset_state not null default 'active',
  created_at timestamptz not null default now(),
  unique (station_id, pump_id, name)
);

create table public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  fuel_type text not null check (char_length(btrim(fuel_type)) between 1 and 40),
  price numeric(12,2) not null check (price > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  set_by uuid not null references public.profiles(id),
  set_by_name text not null default '',
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index fuel_prices_one_active_per_product
  on public.fuel_prices (station_id, fuel_type) where effective_to is null;

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  employee_id uuid not null references public.profiles(id),
  employee_name text not null,
  status public.shift_status not null default 'open',
  shift_date date not null default current_date,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  opened_by_name text not null default '',
  closed_by_name text,
  payments jsonb not null default '{"cash":"","card":"","upi":"","credit":"","other":""}'::jsonb,
  testing jsonb not null default '{"MS":"","HSD":""}'::jsonb,
  credit_sales jsonb not null default '[]'::jsonb,
  note text not null default '',
  approved_by uuid references public.profiles(id),
  approved_by_name text,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id),
  rejected_by_name text,
  rejected_at timestamptz,
  rejection_reason text,
  revised_by uuid references public.profiles(id),
  revised_by_name text,
  revised_at timestamptz
);
create index shifts_station_started_idx on public.shifts (station_id, start_time desc);
create index shifts_station_status_idx on public.shifts (station_id, status);

-- Shift nozzle rows are relational rather than an array. The partial unique
-- index is the concurrency guard: two simultaneous open_shift calls cannot
-- assign the same nozzle to two active shifts.
create table public.shift_nozzles (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete restrict,
  nozzle_id uuid not null references public.nozzles(id) on delete restrict,
  pump_id uuid not null references public.pumps(id) on delete restrict,
  label text not null,
  fuel_type text not null,
  opening_reading numeric(14,2) not null,
  closing_reading numeric(14,2),
  price numeric(12,2) not null check (price > 0),
  price_id uuid not null references public.fuel_prices(id),
  is_open boolean not null default true
);
create unique index shift_nozzles_one_open_shift
  on public.shift_nozzles (nozzle_id) where is_open;
create index shift_nozzles_shift_idx on public.shift_nozzles (shift_id);

create table public.shift_expenses (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  amount numeric(12,2) not null check (amount > 0),
  occurred_at timestamptz not null default now()
);
create index shift_expenses_shift_idx on public.shift_expenses (shift_id, occurred_at, id);

create table public.credit_customers (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null default '',
  outstanding_balance numeric(14,2) not null default 0 check (outstanding_balance >= 0),
  created_from_shift uuid references public.shifts(id),
  created_at timestamptz not null default now()
);
create index credit_customers_station_idx on public.credit_customers (station_id, name);
create index credit_customers_station_phone_idx on public.credit_customers (station_id, phone) where phone <> '';

create table public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  customer_id uuid not null references public.credit_customers(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete restrict,
  transaction_date date not null default current_date,
  type text not null check (type in ('credit', 'payment')),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  recorded_by uuid not null references public.profiles(id),
  recorded_by_name text not null default '',
  recorded_at timestamptz not null default now()
);
create index customer_transactions_customer_idx on public.customer_transactions (customer_id, recorded_at desc);

create table public.tanks (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  fuel_type text not null check (char_length(btrim(fuel_type)) between 1 and 40),
  capacity numeric(14,2) not null check (capacity > 0),
  current_stock numeric(14,2) not null default 0 check (current_stock >= 0),
  state public.asset_state not null default 'active',
  temperature_c numeric(5,2),
  water_cm numeric(7,2),
  last_dip_at timestamptz,
  last_dip_by text,
  state_changed_by uuid references public.profiles(id),
  state_changed_at timestamptz,
  created_at timestamptz not null default now(),
  check (current_stock <= capacity)
);
create index tanks_station_idx on public.tanks (station_id, created_at);

create table public.tank_readings (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  tank_id uuid not null references public.tanks(id) on delete restrict,
  kind text not null check (kind in ('dip', 'delivery')),
  stock_litres numeric(14,2) not null check (stock_litres >= 0),
  previous_stock numeric(14,2) not null check (previous_stock >= 0),
  change numeric(14,2) not null,
  temperature_c numeric(5,2),
  water_cm numeric(7,2),
  invoice text,
  note text not null default '',
  recorded_by uuid not null references public.profiles(id),
  recorded_by_name text not null default '',
  recorded_at timestamptz not null default now()
);
create index tank_readings_station_recorded_idx on public.tank_readings (station_id, recorded_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Access helpers are SECURITY DEFINER so RLS policies can answer access
-- questions without recursively reading a policy-protected table.
create or replace function public.current_account_role()
returns public.account_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_account_role() = 'admin'::public.account_role, false)
$$;

create or replace function public.can_access_station(p_station_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.stations s
      join public.profiles p on p.id = auth.uid()
      where s.id = p_station_id
        and (s.owner_id = p.id or p.station_id = s.id)
    )
$$;

create or replace function public.assert_station_access(p_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if not public.can_access_station(p_station_id) then
    raise exception 'You cannot act on that station.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_owner_station(p_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_account_role() <> 'owner'::public.account_role
     or not exists (
       select 1 from public.stations s where s.id = p_station_id and s.owner_id = auth.uid()
     ) then
    raise exception 'Owner access to this station is required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_station_is_active(p_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_state public.station_state;
begin
  -- Lock the station so an archive cannot pass its "no open shifts" check
  -- while an open_shift call is about to create one.
  select state into v_state from public.stations where id = p_station_id for update;
  if not found then raise exception 'Station not found.' using errcode = 'P0002'; end if;
  if v_state = 'archived'::public.station_state then
    raise exception 'This station is archived.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.json_amount(p_value jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
begin
  v_text := nullif(btrim(coalesce(p_value ->> p_key, '')), '');
  if v_text is null then
    return 0;
  end if;
  return v_text::numeric;
exception when invalid_text_representation then
  raise exception 'Invalid amount for %.', p_key using errcode = '22023';
end;
$$;

/* Account provisioners are service-role-only. The Edge Function creates the
 * auth.users row, then calls these routines to write relational data. */
create or replace function public.provision_owner(
  p_user_id uuid,
  p_name text,
  p_phone text,
  p_username text,
  p_station_name text,
  p_address text
)
returns table (station_id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station_id uuid := gen_random_uuid();
begin
  if char_length(btrim(p_name)) not between 1 and 120
     or char_length(btrim(p_station_name)) not between 1 and 120
     or char_length(btrim(p_address)) not between 1 and 300
     or coalesce(p_username, '') !~ '^[a-z0-9]{1,30}$' then
    raise exception 'Invalid account details.' using errcode = '22023';
  end if;

  insert into public.profiles (id, name, phone, username, role, owner_id)
  values (p_user_id, btrim(p_name), btrim(coalesce(p_phone, '')), lower(p_username), 'owner', p_user_id);

  insert into public.stations (id, name, address, owner_id)
  values (v_station_id, btrim(p_station_name), btrim(p_address), p_user_id);

  return query select v_station_id, lower(p_username);
end;
$$;

create or replace function public.provision_staff(
  p_user_id uuid,
  p_owner_id uuid,
  p_station_id uuid,
  p_name text,
  p_phone text,
  p_username text,
  p_role public.account_role
)
returns table (station_id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('manager'::public.account_role, 'attendant'::public.account_role)
     or char_length(btrim(p_name)) not between 1 and 120
     or coalesce(p_username, '') !~ '^[a-z0-9]{1,30}$' then
    raise exception 'Invalid staff details.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stations where id = p_station_id and owner_id = p_owner_id) then
    raise exception 'That station is not yours.' using errcode = '42501';
  end if;

  insert into public.profiles (id, name, phone, username, role, owner_id, station_id)
  values (
    p_user_id, btrim(p_name), btrim(coalesce(p_phone, '')), lower(p_username),
    p_role, p_owner_id, p_station_id
  );

  return query select p_station_id, lower(p_username);
end;
$$;

/* Station and equipment ------------------------------------------------ */
create or replace function public.add_station(p_name text, p_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.stations;
begin
  if public.current_account_role() <> 'owner'::public.account_role then
    raise exception 'Owner access required.' using errcode = '42501';
  end if;
  if char_length(btrim(p_name)) not between 1 and 120 or char_length(btrim(p_address)) not between 1 and 300 then
    raise exception 'Station name and address are required.' using errcode = '22023';
  end if;
  insert into public.stations (name, address, owner_id)
  values (btrim(p_name), btrim(p_address), auth.uid()) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_station_state(p_station_id uuid, p_state public.station_state)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_owner_station(p_station_id);
  perform 1 from public.stations where id = p_station_id for update;
  if p_state = 'archived' then
    if exists (select 1 from public.shifts where station_id = p_station_id and status = 'open') then
      raise exception 'Close the open shift before archiving this station.' using errcode = '55000';
    end if;
    if exists (select 1 from public.credit_customers where station_id = p_station_id and outstanding_balance > 0) then
      raise exception 'This station has credit outstanding. Settle it before archiving.' using errcode = '55000';
    end if;
  end if;
  update public.stations
  set state = p_state, state_changed_by = auth.uid(), state_changed_at = now()
  where id = p_station_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end;
$$;

create or replace function public.add_pump(p_station_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.pumps;
begin
  perform public.assert_owner_station(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  if char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Pump name is required.' using errcode = '22023';
  end if;
  insert into public.pumps (station_id, name) values (p_station_id, btrim(p_name)) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

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
declare v_row public.nozzles;
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
  insert into public.nozzles (station_id, pump_id, name, fuel_type, last_reading)
  values (p_station_id, p_pump_id, btrim(p_name), btrim(p_fuel_type), coalesce(p_opening_reading, 0))
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_nozzle_state(p_station_id uuid, p_nozzle_id uuid, p_state public.asset_state)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_owner_station(p_station_id);
  -- Lock this nozzle first. open_shift locks the same row before inserting its
  -- claim, so a retirement cannot slip between the availability check and the
  -- insert into shift_nozzles.
  perform 1 from public.nozzles where id = p_nozzle_id and station_id = p_station_id for update;
  if not found then raise exception 'Nozzle not found.' using errcode = 'P0002'; end if;
  if p_state = 'retired' and exists (
    select 1 from public.shift_nozzles where station_id = p_station_id and nozzle_id = p_nozzle_id and is_open
  ) then
    raise exception 'This nozzle is in an open shift.' using errcode = '55000';
  end if;
  update public.nozzles set state = p_state where id = p_nozzle_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end;
$$;

create or replace function public.set_pump_state(p_station_id uuid, p_pump_id uuid, p_state public.asset_state)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_owner_station(p_station_id);
  -- Lock the pump before testing its open-nozzle condition; open_shift locks
  -- the pump too, so either operation observes the other's committed result.
  perform 1 from public.pumps where id = p_pump_id and station_id = p_station_id for update;
  if not found then raise exception 'Pump not found.' using errcode = 'P0002'; end if;
  if p_state = 'retired' and exists (
    select 1
    from public.shift_nozzles sn
    join public.nozzles n on n.id = sn.nozzle_id
    where sn.station_id = p_station_id and n.pump_id = p_pump_id and sn.is_open
  ) then
    raise exception 'This pump is in an open shift.' using errcode = '55000';
  end if;
  update public.pumps set state = p_state where id = p_pump_id;
  update public.nozzles set state = p_state where station_id = p_station_id and pump_id = p_pump_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end;
$$;

create or replace function public.set_price(p_station_id uuid, p_fuel_type text, p_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.fuel_prices; v_name text;
begin
  perform public.assert_owner_station(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  if char_length(btrim(p_fuel_type)) not between 1 and 40 or p_price is null or p_price <= 0 then
    raise exception 'Price must be a positive number.' using errcode = '22023';
  end if;
  select name into v_name from public.profiles where id = auth.uid();
  update public.fuel_prices
  set effective_to = now()
  where station_id = p_station_id and fuel_type = btrim(p_fuel_type) and effective_to is null;
  insert into public.fuel_prices (station_id, fuel_type, price, set_by, set_by_name)
  values (p_station_id, btrim(p_fuel_type), p_price, auth.uid(), coalesce(v_name, ''))
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

/* Atomic shift operations --------------------------------------------- */
create or replace function public.open_shift(
  p_station_id uuid,
  p_nozzle_ids uuid[],
  p_employee_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
  v_nozzle_id uuid;
  v_nozzle record;
  v_price public.fuel_prices;
  v_employee_name text;
begin
  perform public.assert_station_access(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  if coalesce(cardinality(p_nozzle_ids), 0) = 0 then
    raise exception 'Select at least one nozzle.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_nozzle_ids) as x) <> cardinality(p_nozzle_ids) then
    raise exception 'Select each nozzle only once.' using errcode = '22023';
  end if;

  select name into v_employee_name from public.profiles where id = auth.uid();
  insert into public.shifts (station_id, employee_id, employee_name, opened_by_name)
  values (p_station_id, auth.uid(), coalesce(v_employee_name, btrim(coalesce(p_employee_name, ''))), coalesce(v_employee_name, ''))
  returning id into v_shift_id;

  foreach v_nozzle_id in array p_nozzle_ids loop
    select n.*, p.name as pump_name, p.state as pump_state
    into v_nozzle
    from public.nozzles n
    join public.pumps p on p.id = n.pump_id
    where n.id = v_nozzle_id and n.station_id = p_station_id
    for update of n, p;

    if not found then raise exception 'Nozzle not found.' using errcode = 'P0002'; end if;
    if v_nozzle.pump_state <> 'active'::public.asset_state
       or v_nozzle.state <> 'active'::public.asset_state then
      raise exception 'That nozzle is out of service.' using errcode = '55000';
    end if;

    select * into v_price
    from public.fuel_prices
    where station_id = p_station_id and fuel_type = v_nozzle.fuel_type and effective_to is null;
    if not found then
      raise exception 'Set a price for % before starting a shift.', v_nozzle.fuel_type using errcode = '55000';
    end if;

    insert into public.shift_nozzles (
      shift_id, station_id, nozzle_id, pump_id, label, fuel_type, opening_reading, price, price_id
    ) values (
      v_shift_id, p_station_id, v_nozzle.id, v_nozzle.pump_id,
      coalesce(v_nozzle.pump_name, 'Pump') || ' · ' || v_nozzle.name,
      v_nozzle.fuel_type, v_nozzle.last_reading, v_price.price, v_price.id
    );
  end loop;

  return v_shift_id;
end;
$$;

create or replace function public.close_shift(
  p_station_id uuid,
  p_shift_id uuid,
  p_closing_readings jsonb,
  p_payments jsonb default '{}'::jsonb,
  p_testing jsonb default '{}'::jsonb,
  p_note text default '',
  p_credit_sales jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_nozzle record;
  v_closing numeric;
  v_profile public.profiles;
  v_sale jsonb;
  v_customer_id uuid;
  v_customer public.credit_customers;
  v_amount numeric;
  v_name text;
  v_phone text;
  v_credit_rows jsonb := '[]'::jsonb;
begin
  perform public.assert_station_access(p_station_id);
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_shift from public.shifts where id = p_shift_id and station_id = p_station_id for update;
  if not found then raise exception 'Shift not found.' using errcode = 'P0002'; end if;
  if v_shift.status <> 'open'::public.shift_status then
    raise exception 'That shift is already closed.' using errcode = '55000';
  end if;

  for v_nozzle in
    select * from public.shift_nozzles where shift_id = p_shift_id order by id for update
  loop
    begin
      v_closing := nullif(btrim(coalesce(p_closing_readings ->> v_nozzle.nozzle_id::text, '')), '')::numeric;
    exception when invalid_text_representation then
      raise exception 'Closing reading is invalid for %.', v_nozzle.label using errcode = '22023';
    end;
    if v_closing is null or v_closing < 0 then
      raise exception 'Closing reading missing for %.', v_nozzle.label using errcode = '22023';
    end if;
    update public.nozzles set last_reading = v_closing where id = v_nozzle.nozzle_id;
    update public.shift_nozzles
    set closing_reading = v_closing, is_open = false
    where id = v_nozzle.id;
  end loop;

  for v_sale in select value from jsonb_array_elements(coalesce(p_credit_sales, '[]'::jsonb)) loop
    begin
      v_amount := coalesce(nullif(btrim(coalesce(v_sale ->> 'amount', '')), '')::numeric, 0);
    exception when invalid_text_representation then
      raise exception 'Credit sale amount is invalid.' using errcode = '22023';
    end;
    if v_amount <= 0 then raise exception 'Credit sale amount must be greater than zero.' using errcode = '22023'; end if;
    v_name := btrim(coalesce(v_sale ->> 'name', ''));
    v_phone := btrim(coalesce(v_sale ->> 'phone', ''));

    if nullif(v_sale ->> 'customerId', '') is not null then
      begin
        v_customer_id := (v_sale ->> 'customerId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Credit customer is invalid.' using errcode = '22023';
      end;
      select * into v_customer from public.credit_customers
      where id = v_customer_id and station_id = p_station_id for update;
      if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
    elsif v_phone <> '' then
      select * into v_customer from public.credit_customers
      where station_id = p_station_id and phone = v_phone
      order by created_at limit 1 for update;
      if found then
        v_customer_id := v_customer.id;
      else
        insert into public.credit_customers (station_id, name, phone, created_from_shift)
        values (p_station_id, coalesce(nullif(v_name, ''), 'Walk-in'), v_phone, p_shift_id)
        returning id into v_customer_id;
      end if;
    else
      insert into public.credit_customers (station_id, name, phone, created_from_shift)
      values (p_station_id, coalesce(nullif(v_name, ''), 'Walk-in'), '', p_shift_id)
      returning id into v_customer_id;
    end if;

    update public.credit_customers
    set outstanding_balance = outstanding_balance + v_amount
    where id = v_customer_id
    returning * into v_customer;
    insert into public.customer_transactions (
      station_id, customer_id, shift_id, type, amount, note, recorded_by, recorded_by_name
    ) values (
      p_station_id, v_customer_id, p_shift_id, 'credit', v_amount,
      v_shift.employee_name || ' shift', auth.uid(), coalesce(v_profile.name, '')
    );
    v_credit_rows := v_credit_rows || jsonb_build_array(jsonb_build_object(
      'customerId', v_customer_id, 'name', v_customer.name, 'phone', v_customer.phone, 'amount', v_amount
    ));
  end loop;

  update public.shifts
  set
    payments = jsonb_build_object(
      'cash', public.json_amount(p_payments, 'cash'),
      'card', public.json_amount(p_payments, 'card'),
      'upi', public.json_amount(p_payments, 'upi'),
      'credit', public.json_amount(p_payments, 'credit'),
      'other', public.json_amount(p_payments, 'other')
    ),
    testing = jsonb_build_object(
      'MS', public.json_amount(p_testing, 'MS'),
      'HSD', public.json_amount(p_testing, 'HSD')
    ),
    credit_sales = v_credit_rows,
    note = btrim(coalesce(p_note, '')),
    status = 'pending_review',
    end_time = now(),
    closed_by_name = coalesce(v_profile.name, '')
  where id = p_shift_id;

  return jsonb_build_object('ok', true, 'shiftId', p_shift_id);
end;
$$;

create or replace function public.add_shift_expense(p_station_id uuid, p_shift_id uuid, p_label text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_station_access(p_station_id);
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

create or replace function public.review_shift(p_station_id uuid, p_shift_id uuid, p_action text, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role public.account_role; v_name text; v_status public.shift_status;
begin
  perform public.assert_station_access(p_station_id);
  v_role := public.current_account_role();
  if v_role not in ('owner'::public.account_role, 'manager'::public.account_role) then
    raise exception 'Only an owner or manager can review shifts.' using errcode = '42501';
  end if;
  select status into v_status from public.shifts where id = p_shift_id and station_id = p_station_id for update;
  if not found then raise exception 'Shift not found.' using errcode = 'P0002'; end if;
  select name into v_name from public.profiles where id = auth.uid();
  if p_action = 'approve' then
    if v_status not in ('pending_review'::public.shift_status, 'rejected'::public.shift_status) then
      raise exception 'Only a submitted shift can be approved.' using errcode = '55000';
    end if;
    update public.shifts set status = 'approved', approved_by = auth.uid(), approved_by_name = coalesce(v_name, ''),
      approved_at = now(), rejection_reason = null where id = p_shift_id;
    return jsonb_build_object('ok', true, 'status', 'approved');
  elsif p_action = 'reject' then
    if v_status <> 'pending_review'::public.shift_status then
      raise exception 'Only a submitted shift can be sent back.' using errcode = '55000';
    end if;
    update public.shifts set status = 'rejected', rejected_by = auth.uid(), rejected_by_name = coalesce(v_name, ''),
      rejected_at = now(), rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'Correction requested')
      where id = p_shift_id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
  raise exception 'Unknown review action.' using errcode = '22023';
end;
$$;

create or replace function public.revise_shift(
  p_station_id uuid,
  p_shift_id uuid,
  p_expenses jsonb default null,
  p_testing jsonb default null,
  p_payments jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_status public.shift_status; v_expense jsonb; v_label text; v_amount numeric; v_name text;
begin
  perform public.assert_station_access(p_station_id);
  if public.current_account_role() not in ('owner'::public.account_role, 'manager'::public.account_role) then
    raise exception 'Only an owner or manager can revise shifts.' using errcode = '42501';
  end if;
  select status into v_status from public.shifts where id = p_shift_id and station_id = p_station_id for update;
  if not found then raise exception 'Shift not found.' using errcode = 'P0002'; end if;
  if v_status = 'approved'::public.shift_status then raise exception 'An approved shift is locked.' using errcode = '55000'; end if;
  if v_status = 'open'::public.shift_status then raise exception 'Close the shift before revising it.' using errcode = '55000'; end if;

  if p_expenses is not null then
    delete from public.shift_expenses where shift_id = p_shift_id;
    for v_expense in select value from jsonb_array_elements(p_expenses) loop
      v_label := btrim(coalesce(v_expense ->> 'label', ''));
      begin v_amount := coalesce(nullif(btrim(coalesce(v_expense ->> 'amount', '')), '')::numeric, 0);
      exception when invalid_text_representation then raise exception 'Expense amount is invalid.' using errcode = '22023'; end;
      if char_length(v_label) between 1 and 80 and v_amount > 0 then
        insert into public.shift_expenses (shift_id, label, amount) values (p_shift_id, v_label, v_amount);
      else
        raise exception 'Expense label and amount are required.' using errcode = '22023';
      end if;
    end loop;
  end if;

  select name into v_name from public.profiles where id = auth.uid();
  update public.shifts set
    testing = case when p_testing is null then testing else jsonb_build_object('MS', public.json_amount(p_testing, 'MS'), 'HSD', public.json_amount(p_testing, 'HSD')) end,
    payments = case when p_payments is null then payments else jsonb_build_object('cash', public.json_amount(p_payments, 'cash'), 'card', public.json_amount(p_payments, 'card'), 'upi', public.json_amount(p_payments, 'upi'), 'credit', public.json_amount(p_payments, 'credit'), 'other', public.json_amount(p_payments, 'other')) end,
    note = case when p_note is null then note else btrim(p_note) end,
    status = case when status = 'rejected'::public.shift_status then 'pending_review'::public.shift_status else status end,
    revised_by = auth.uid(), revised_by_name = coalesce(v_name, ''), revised_at = now()
  where id = p_shift_id;
  return jsonb_build_object('ok', true);
end;
$$;

/* Atomic customer balance operations --------------------------------- */
create or replace function public.create_customer(p_station_id uuid, p_name text, p_phone text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.credit_customers;
begin
  perform public.assert_station_access(p_station_id);
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
  perform public.assert_station_access(p_station_id);
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

/* Tanks and stock ----------------------------------------------------- */
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
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_tank_state(p_station_id uuid, p_tank_id uuid, p_state public.asset_state)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tank public.tanks; v_name text;
begin
  perform public.assert_owner_station(p_station_id);
  select * into v_tank from public.tanks where id = p_tank_id and station_id = p_station_id for update;
  if not found then raise exception 'Tank not found.' using errcode = 'P0002'; end if;
  if p_state = 'retired' and v_tank.current_stock > 0 then
    raise exception 'This tank still holds stock. Draw it down before taking it out of service.' using errcode = '55000';
  end if;
  select name into v_name from public.profiles where id = auth.uid();
  update public.tanks set state = p_state, state_changed_by = auth.uid(), state_changed_at = now() where id = p_tank_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end;
$$;

create or replace function public.update_tank(
  p_station_id uuid, p_tank_id uuid, p_name text default null, p_fuel_type text default null, p_capacity numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tank public.tanks;
begin
  perform public.assert_owner_station(p_station_id);
  select * into v_tank from public.tanks where id = p_tank_id and station_id = p_station_id for update;
  if not found then raise exception 'Tank not found.' using errcode = 'P0002'; end if;
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Tank name is required.' using errcode = '22023'; end if;
  if p_fuel_type is not null and char_length(btrim(p_fuel_type)) not between 1 and 40 then raise exception 'Fuel type is required.' using errcode = '22023'; end if;
  if p_capacity is not null and (p_capacity <= 0 or p_capacity < v_tank.current_stock) then raise exception 'Capacity cannot be less than stock already in the tank.' using errcode = '22023'; end if;
  update public.tanks set name = coalesce(btrim(p_name), name), fuel_type = coalesce(btrim(p_fuel_type), fuel_type), capacity = coalesce(p_capacity, capacity)
  where id = p_tank_id;
  return jsonb_build_object('ok', true);
end;
$$;

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
  perform public.assert_station_access(p_station_id);
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
  perform public.assert_station_access(p_station_id);
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

/* Read-only browser access via RLS ----------------------------------- */
alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.pumps enable row level security;
alter table public.nozzles enable row level security;
alter table public.fuel_prices enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_nozzles enable row level security;
alter table public.shift_expenses enable row level security;
alter table public.credit_customers enable row level security;
alter table public.customer_transactions enable row level security;
alter table public.tanks enable row level security;
alter table public.tank_readings enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or (owner_id = auth.uid() and role in ('manager'::public.account_role, 'attendant'::public.account_role))
);
create policy stations_read on public.stations for select to authenticated using (public.can_access_station(id));
create policy pumps_read on public.pumps for select to authenticated using (public.can_access_station(station_id));
create policy nozzles_read on public.nozzles for select to authenticated using (public.can_access_station(station_id));
create policy prices_read on public.fuel_prices for select to authenticated using (public.can_access_station(station_id));
create policy shifts_read on public.shifts for select to authenticated using (public.can_access_station(station_id));
create policy shift_nozzles_read on public.shift_nozzles for select to authenticated using (public.can_access_station(station_id));
create policy shift_expenses_read on public.shift_expenses for select to authenticated using (
  exists (select 1 from public.shifts s where s.id = shift_id and public.can_access_station(s.station_id))
);
create policy customers_read on public.credit_customers for select to authenticated using (public.can_access_station(station_id));
create policy customer_transactions_read on public.customer_transactions for select to authenticated using (public.can_access_station(station_id));
create policy tanks_read on public.tanks for select to authenticated using (public.can_access_station(station_id));
create policy tank_readings_read on public.tank_readings for select to authenticated using (public.can_access_station(station_id));

grant select on public.profiles, public.stations, public.pumps, public.nozzles, public.fuel_prices,
  public.shifts, public.shift_nozzles, public.shift_expenses, public.credit_customers,
  public.customer_transactions, public.tanks, public.tank_readings to authenticated;

-- Lock down every function first, then expose only the browser-safe RPC
-- surface. Service-role-only provisioners are intentionally not callable
-- from the anon/authenticated browser clients.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_account_role(), public.is_admin(), public.can_access_station(uuid) to authenticated;
grant execute on function public.add_station(text, text), public.set_station_state(uuid, public.station_state),
  public.add_pump(uuid, text), public.add_nozzle(uuid, uuid, text, text, numeric),
  public.set_nozzle_state(uuid, uuid, public.asset_state), public.set_pump_state(uuid, uuid, public.asset_state),
  public.set_price(uuid, text, numeric), public.open_shift(uuid, uuid[], text),
  public.close_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb),
  public.add_shift_expense(uuid, uuid, text, numeric), public.remove_shift_expense(uuid, uuid, integer),
  public.review_shift(uuid, uuid, text, text), public.revise_shift(uuid, uuid, jsonb, jsonb, jsonb, text),
  public.create_customer(uuid, text, text), public.record_customer_transaction(uuid, uuid, text, numeric, text, date),
  public.add_tank(uuid, text, text, numeric, numeric), public.set_tank_state(uuid, uuid, public.asset_state),
  public.update_tank(uuid, uuid, text, text, numeric), public.record_dip(uuid, uuid, numeric, numeric, numeric, text),
  public.record_delivery(uuid, uuid, numeric, numeric, text, text)
to authenticated;
grant execute on function public.provision_owner(uuid, text, text, text, text, text),
  public.provision_staff(uuid, uuid, uuid, text, text, text, public.account_role)
to service_role;
