-- One customer, one account: a credit entry must never insert a duplicate
-- credit_customers row for a person the station already knows.
--
-- Every credit entry path used to decide "new customer?" on its own:
--   * create_customer inserted unconditionally, so the same name and phone
--     keyed twice in a day produced two accounts — and two balances.
--   * close_shift and resubmit_rejected_shift matched the phone as an exact
--     string, so "9988000001" and "9988 000 001" were two different people,
--     and phone-less walk-ins were always inserted, even for the same name.
--
-- All three paths now resolve the customer through one helper,
-- find_or_create_customer, which matches on the phone's digits (typing
-- spaces or dashes never splits an account) or, for phone-less walk-ins, on
-- the exact name. Archived accounts are never matched: a customer coming
-- back after an archive gets a fresh active account. An advisory lock
-- serializes resolution, so two attendants keying the same customer at the
-- same moment cannot both insert.

/* ------------------------------------------------------------------ */
/* 1. Phone comparison helper                                          */
/* ------------------------------------------------------------------ */

create or replace function public.normalize_customer_phone(p_phone text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
$$;

comment on function public.normalize_customer_phone(text) is
  'A credit customer phone reduced to its digits — the form it is compared in.';

revoke execute on function public.normalize_customer_phone(text) from public;
revoke execute on function public.normalize_customer_phone(text) from anon, authenticated;

-- Speeds up the digit match inside find_or_create_customer.
create index if not exists credit_customers_phone_digits_idx
  on public.credit_customers (station_id, public.normalize_customer_phone(phone))
  where public.normalize_customer_phone(phone) <> '' and archived_at is null;

/* ------------------------------------------------------------------ */
/* 2. One resolver behind every credit entry path                      */
/* ------------------------------------------------------------------ */

create or replace function public.find_or_create_customer(
  p_station_id uuid,
  p_name text,
  p_phone text default '',
  p_shift_id uuid default null
)
returns table (customer public.credit_customers, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_digits text := public.normalize_customer_phone(v_phone);
  v_customer public.credit_customers;
begin
  -- Serialize resolution per station and identity: two attendants keying
  -- the same customer at the same moment cannot both insert.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_station_id::text || '|' || (
        case
          when v_digits <> '' then 'phone:' || v_digits
          else 'name:' || lower(v_name)
        end
      ),
      0
    )
  );

  if v_digits <> '' then
    -- The phone's digits are the account's identity; how it was typed
    -- (spaces, dashes) never splits one person into two accounts.
    select c.* into v_customer
    from public.credit_customers c
    where c.station_id = p_station_id
      and c.archived_at is null
      and public.normalize_customer_phone(c.phone) = v_digits
    order by c.created_at
    limit 1
    for update;
  elsif v_name <> '' then
    -- Phone-less walk-ins dedupe on the exact name. Anonymous entries (no
    -- name and no phone) are never merged: each stays its own walk-in.
    select c.* into v_customer
    from public.credit_customers c
    where c.station_id = p_station_id
      and c.archived_at is null
      and c.phone = ''
      and lower(btrim(c.name)) = lower(v_name)
    order by c.created_at
    limit 1
    for update;
  end if;

  if found then
    -- A placeholder name from an earlier walk-in entry is replaced by the
    -- real name the first time it is known; the audit trail records it.
    if v_name <> '' and v_customer.name = 'Walk-in' then
      insert into public.customer_audit (station_id, customer_id, action, acted_by, details)
      values (
        p_station_id,
        v_customer.id,
        'updated',
        auth.uid(),
        jsonb_build_object(
          'from', jsonb_build_object('name', v_customer.name, 'phone', v_customer.phone),
          'to', jsonb_build_object('name', v_name, 'phone', v_customer.phone)
        )
      );
      update public.credit_customers
      set name = v_name
      where id = v_customer.id
      returning * into v_customer;
    end if;
    return query select v_customer, false;
    return;
  end if;

  insert into public.credit_customers (station_id, name, phone, created_from_shift)
  values (
    p_station_id,
    coalesce(nullif(v_name, ''), 'Walk-in'),
    v_phone,
    p_shift_id
  )
  returning * into v_customer;

  return query select v_customer, true;
end;
$$;

comment on function public.find_or_create_customer(uuid, text, text, uuid) is
  'Internal resolver shared by create_customer, close_shift, and resubmit_rejected_shift: returns the existing active account for a phone (compared as digits) or an exact phone-less name match, and inserts only when the station has never seen the customer.';

revoke execute on function public.find_or_create_customer(uuid, text, text, uuid) from public;
revoke execute on function public.find_or_create_customer(uuid, text, text, uuid) from anon, authenticated;

/* ------------------------------------------------------------------ */
/* 3. create_customer reuses the resolver                              */
/* ------------------------------------------------------------------ */

create or replace function public.create_customer(p_station_id uuid, p_name text, p_phone text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_result record;
  v_customer public.credit_customers;
  v_created boolean;
begin
  perform public.assert_station_access(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;
  select * into v_result
  from public.find_or_create_customer(p_station_id, v_name, p_phone, null) f;
  v_customer := v_result.customer;
  v_created := v_result.created;
  -- 'created' tells the caller whether a new account was opened or an
  -- existing one was reused, so the UI can say so instead of staying silent.
  return to_jsonb(v_customer) || jsonb_build_object('created', v_created);
end;
$$;

comment on function public.create_customer(uuid, text, text) is
  'Adds a station credit customer, or returns the existing account when the phone (compared as digits) or the exact phone-less name already belongs to the station. All station members may create accounts; financial ledger actions remain manager/owner-only.';

revoke execute on function public.create_customer(uuid, text, text) from public;
grant execute on function public.create_customer(uuid, text, text) to authenticated;

/* ------------------------------------------------------------------ */
/* 4. close_shift resolves customers through the resolver              */
/* ------------------------------------------------------------------ */

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
  v_litres numeric;
  v_tank public.tanks;
  v_profile public.profiles;
  v_sale jsonb;
  v_customer_id uuid;
  v_customer public.credit_customers;
  v_amount numeric;
  v_name text;
  v_phone text;
  v_transaction_id uuid;
  v_transaction public.customer_transactions;
  v_credit_total numeric;
begin
  perform public.assert_station_access(p_station_id);
  select * into v_profile from public.profiles where id = auth.uid();

  select * into v_shift
  from public.shifts
  where id = p_shift_id and station_id = p_station_id
  for update;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'open'::public.shift_status then
    raise exception 'That shift is already closed.' using errcode = '55000';
  end if;

  -- Serialize close against an in-flight edit or void. add_shift_credit already
  -- serializes on the shift row above.
  perform 1
  from public.customer_transactions
  where shift_id = p_shift_id and type = 'credit'
  for update;

  for v_nozzle in
    select sn.*, n.tank_id
    from public.shift_nozzles sn
    join public.nozzles n on n.id = sn.nozzle_id
    where sn.shift_id = p_shift_id
    order by sn.id
    for update of sn, n
  loop
    begin
      v_closing := nullif(
        btrim(coalesce(p_closing_readings ->> v_nozzle.nozzle_id::text, '')),
        ''
      )::numeric;
    exception when invalid_text_representation then
      raise exception 'Closing reading is invalid for %.', v_nozzle.label
        using errcode = '22023';
    end;

    if v_closing is null or v_closing < 0 then
      raise exception 'Closing reading missing for %.', v_nozzle.label using errcode = '22023';
    end if;
    if v_nozzle.tank_id is null then
      raise exception 'Map % to a tank before closing this shift.', v_nozzle.label
        using errcode = '55000';
    end if;

    v_litres := round(
      case
        when v_closing >= v_nozzle.opening_reading
          then v_closing - v_nozzle.opening_reading
        else 1000000 - v_nozzle.opening_reading + v_closing
      end,
      2
    );

    select * into v_tank
    from public.tanks
    where id = v_nozzle.tank_id and station_id = p_station_id
    for update;
    if not found then
      raise exception 'Mapped tank not found for %.', v_nozzle.label using errcode = 'P0002';
    end if;
    if v_tank.current_stock < v_litres then
      raise exception 'Tank stock would become negative. Verify the meter reading or tank configuration.'
        using errcode = '23514';
    end if;

    insert into public.stock_movements (
      station_id, tank_id, fuel_type, movement_type, quantity_litres,
      reference_type, reference_id, reference_line_id, before_stock, after_stock,
      recorded_by, recorded_by_name, note
    ) values (
      p_station_id, v_tank.id, v_tank.fuel_type, 'sale', -v_litres,
      'shift', p_shift_id, v_nozzle.id, v_tank.current_stock,
      v_tank.current_stock - v_litres, auth.uid(), coalesce(v_profile.name, ''),
      v_nozzle.label
    );

    update public.tanks
    set current_stock = current_stock - v_litres
    where id = v_tank.id;
    update public.nozzles set last_reading = v_closing where id = v_nozzle.nozzle_id;
    update public.shift_nozzles
    set closing_reading = v_closing, is_open = false
    where id = v_nozzle.id;
  end loop;

  -- Rows carrying transactionId were posted by add_shift_credit while the
  -- shift was running. Validate them, but never post them a second time.
  -- Rows without an id are legacy close-screen additions and are inserted once
  -- inside this transaction.
  for v_sale in
    select value from jsonb_array_elements(coalesce(p_credit_sales, '[]'::jsonb))
  loop
    begin
      v_amount := coalesce(
        nullif(btrim(coalesce(v_sale ->> 'amount', '')), '')::numeric,
        0
      );
    exception when invalid_text_representation then
      raise exception 'Credit sale amount is invalid.' using errcode = '22023';
    end;
    if v_amount <= 0 then
      raise exception 'Credit sale amount must be greater than zero.' using errcode = '22023';
    end if;
    if v_amount > 10000000 then
      raise exception 'That credit amount is too large.' using errcode = '22023';
    end if;

    v_transaction_id := null;
    if nullif(v_sale ->> 'transactionId', '') is not null then
      begin
        v_transaction_id := (v_sale ->> 'transactionId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Recorded credit reference is invalid.' using errcode = '22023';
      end;

      select * into v_transaction
      from public.customer_transactions
      where id = v_transaction_id
        and station_id = p_station_id
        and shift_id = p_shift_id
        and type = 'credit'
        and status = 'active'
      for update;
      if not found then
        raise exception 'Recorded credit no longer matches this shift. Reload before closing.'
          using errcode = '55000';
      end if;
      if v_transaction.amount is distinct from v_amount then
        raise exception 'Recorded credit changed. Reload the shift before closing.'
          using errcode = '55000';
      end if;
      if nullif(v_sale ->> 'customerId', '') is not null
         and v_transaction.customer_id is distinct from (v_sale ->> 'customerId')::uuid then
        raise exception 'Recorded credit customer changed. Reload the shift before closing.'
          using errcode = '55000';
      end if;
      continue;
    end if;

    v_name := btrim(coalesce(v_sale ->> 'name', ''));
    v_phone := btrim(coalesce(v_sale ->> 'phone', ''));

    if nullif(v_sale ->> 'customerId', '') is not null then
      begin
        v_customer_id := (v_sale ->> 'customerId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Credit customer is invalid.' using errcode = '22023';
      end;
      select * into v_customer
      from public.credit_customers
      where id = v_customer_id and station_id = p_station_id
      for update;
      if not found then
        raise exception 'Customer not found.' using errcode = 'P0002';
      end if;
    else
      -- One shared resolver: a phone match (compared as digits, so formatting
      -- never splits an account) or an exact name match for phone-less
      -- walk-ins reuses the existing account instead of inserting a duplicate.
      v_customer := (
        select f.customer
        from public.find_or_create_customer(p_station_id, v_name, v_phone, p_shift_id) f
      );
      v_customer_id := v_customer.id;
    end if;

    if v_customer.archived_at is not null then
      raise exception 'Restore this customer before recording credit.' using errcode = '55000';
    end if;

    update public.credit_customers
    set outstanding_balance = outstanding_balance + v_amount
    where id = v_customer_id;

    insert into public.customer_transactions (
      station_id, customer_id, shift_id, transaction_date, type, amount, note,
      recorded_by, recorded_by_name
    ) values (
      p_station_id, v_customer_id, p_shift_id, current_date, 'credit', v_amount,
      v_shift.employee_name || ' shift', auth.uid(), coalesce(v_profile.name, '')
    ) returning * into v_transaction;

    insert into public.customer_transaction_audit (
      transaction_id, customer_id, station_id, shift_id, action,
      old_amount, new_amount, new_customer_id, reason, acted_by, acted_by_name
    ) values (
      v_transaction.id, v_customer_id, p_station_id, p_shift_id, 'created',
      null, v_amount, v_customer_id, '', auth.uid(), coalesce(v_profile.name, '')
    );
  end loop;

  -- Never trust p_payments.credit: all active shift-linked transactions are
  -- included, even when an older client omitted them from p_credit_sales.
  update public.shifts
  set
    payments = jsonb_build_object(
      'cash', public.json_amount(p_payments, 'cash'),
      'card', public.json_amount(p_payments, 'card'),
      'upi', public.json_amount(p_payments, 'upi'),
      'credit', 0,
      'other', public.json_amount(p_payments, 'other')
    ),
    testing = jsonb_build_object(
      'MS', public.json_amount(p_testing, 'MS'),
      'HSD', public.json_amount(p_testing, 'HSD')
    ),
    credit_sales = '[]'::jsonb,
    note = btrim(coalesce(p_note, '')),
    status = 'pending_review',
    end_time = now(),
    closed_by_name = coalesce(v_profile.name, '')
  where id = p_shift_id;

  perform public.refresh_shift_credit_snapshot(p_shift_id);
  select public.json_amount(payments, 'credit') into v_credit_total
  from public.shifts where id = p_shift_id;

  return jsonb_build_object(
    'ok', true,
    'shiftId', p_shift_id,
    'creditTotal', v_credit_total
  );
end;
$$;

comment on function public.close_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb) is
  'Closes a shift atomically. Active shift-linked customer transactions are the authoritative credit total; previously posted running credit is never duplicated.';

/* ------------------------------------------------------------------ */
/* 5. resubmit_rejected_shift resolves customers through the resolver  */
/* ------------------------------------------------------------------ */

create or replace function public.resubmit_rejected_shift(
  p_station_id uuid,
  p_shift_id uuid,
  p_closing_readings jsonb,
  p_payments jsonb default '{}'::jsonb,
  p_testing jsonb default '{}'::jsonb,
  p_note text default '',
  p_credit_sales jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_profile public.profiles;
  v_role public.account_role;
  v_nozzle record;
  v_closing numeric;
  v_previous_litres numeric;
  v_new_litres numeric;
  v_stock_delta numeric;
  v_tank public.tanks;
  v_sale_movement public.stock_movements;
  v_after_stock numeric;
  v_expense jsonb;
  v_label text;
  v_amount numeric;
  v_transaction public.customer_transactions;
  v_sale jsonb;
  v_customer_id uuid;
  v_customer public.credit_customers;
  v_name text;
  v_phone text;
begin
  perform public.assert_station_access(p_station_id);

  -- Attendants have the correction flow; managers and owners may also use the
  -- trusted RPC when helping an operator. Nobody else can call it.
  v_role := public.current_account_role();
  if v_role = 'attendant'::public.account_role then
    perform public.assert_own_shift(p_shift_id);
  elsif v_role not in ('owner'::public.account_role, 'manager'::public.account_role)
        or not public.can_manage_station(p_station_id) then
    raise exception 'Only the shift operator, an owner, or a manager can resubmit a shift.'
      using errcode = '42501';
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id and station_id = p_station_id
  for update;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'rejected'::public.shift_status then
    raise exception 'Only a shift sent back for correction can be resubmitted.'
      using errcode = '55000';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  /*
   * Validate every reading before changing anything. Meter corrections are
   * allowed only while no later shift has used that nozzle, and only while its
   * current reading is still the one this rejected shift set. That prevents a
   * correction from silently breaking the opening reading of a newer shift.
   */
  for v_nozzle in
    select sn.*, n.last_reading as current_nozzle_reading
    from public.shift_nozzles sn
    join public.nozzles n on n.id = sn.nozzle_id
    where sn.shift_id = p_shift_id
    order by sn.id
    for update of sn, n
  loop
    begin
      v_closing := nullif(
        btrim(coalesce(p_closing_readings ->> v_nozzle.nozzle_id::text, '')),
        ''
      )::numeric;
    exception when invalid_text_representation then
      raise exception 'Closing reading is invalid for %.', v_nozzle.label using errcode = '22023';
    end;
    if v_closing is null or v_closing < 0 then
      raise exception 'Closing reading missing for %.', v_nozzle.label using errcode = '22023';
    end if;

    if v_closing is distinct from v_nozzle.closing_reading then
      if exists (
        select 1
        from public.shift_nozzles later_nozzle
        join public.shifts later_shift on later_shift.id = later_nozzle.shift_id
        where later_nozzle.nozzle_id = v_nozzle.nozzle_id
          and later_nozzle.shift_id <> p_shift_id
          and later_shift.start_time > v_shift.start_time
      ) then
        raise exception 'The closing reading for % cannot be changed because a newer shift has already started on this nozzle.', v_nozzle.label
          using errcode = '55000';
      end if;

      if v_nozzle.current_nozzle_reading is distinct from v_nozzle.closing_reading then
        raise exception 'The meter reading for % has changed since this shift closed. Ask an owner or manager to reconcile it.', v_nozzle.label
          using errcode = '55000';
      end if;

      select * into v_sale_movement
      from public.stock_movements
      where reference_type = 'shift'
        and reference_id = p_shift_id
        and reference_line_id = v_nozzle.id
      for update;
      if not found then
        raise exception 'The stock entry for % cannot be found, so its meter reading cannot be corrected safely.', v_nozzle.label
          using errcode = '55000';
      end if;
    end if;
  end loop;

  -- A customer payment after this shift's credit sale means the old sale has
  -- already been settled in the ledger. Do not let a resubmission erase or
  -- alter that financial history; a manager must make an explicit adjustment.
  if exists (
    select 1
    from public.customer_transactions old_credit
    join public.customer_transactions later_payment
      on later_payment.customer_id = old_credit.customer_id
     and later_payment.type = 'payment'
     and later_payment.status = 'active'
     and later_payment.recorded_at > old_credit.recorded_at
    where old_credit.shift_id = p_shift_id
      and old_credit.type = 'credit'
      and old_credit.status = 'active'
  ) then
    raise exception 'A payment has already been recorded against credit from this shift. Ask an owner or manager to correct the credit sale.'
      using errcode = '55000';
  end if;

  /* Meter and stock correction -------------------------------------- */
  for v_nozzle in
    select sn.*
    from public.shift_nozzles sn
    where sn.shift_id = p_shift_id
    order by sn.id
    for update
  loop
    v_closing := nullif(
      btrim(coalesce(p_closing_readings ->> v_nozzle.nozzle_id::text, '')),
      ''
    )::numeric;

    if v_closing is distinct from v_nozzle.closing_reading then
      select * into v_sale_movement
      from public.stock_movements
      where reference_type = 'shift'
        and reference_id = p_shift_id
        and reference_line_id = v_nozzle.id
      for update;

      select * into v_tank
      from public.tanks
      where id = v_sale_movement.tank_id and station_id = p_station_id
      for update;
      if not found then
        raise exception 'The mapped tank for % cannot be found.', v_nozzle.label using errcode = 'P0002';
      end if;

      v_previous_litres := round(
        case
          when v_nozzle.closing_reading >= v_nozzle.opening_reading
            then v_nozzle.closing_reading - v_nozzle.opening_reading
          else 1000000 - v_nozzle.opening_reading + v_nozzle.closing_reading
        end,
        2
      );
      v_new_litres := round(
        case
          when v_closing >= v_nozzle.opening_reading
            then v_closing - v_nozzle.opening_reading
          else 1000000 - v_nozzle.opening_reading + v_closing
        end,
        2
      );
      -- The tank currently reflects the previous submitted quantity. Add back
      -- what was over-recorded, or deduct what was under-recorded.
      v_stock_delta := v_previous_litres - v_new_litres;
      v_after_stock := v_tank.current_stock + v_stock_delta;
      if v_after_stock < 0 then
        raise exception 'Tank stock would become negative. Verify the corrected reading for %.', v_nozzle.label
          using errcode = '23514';
      end if;
      if v_after_stock > v_tank.capacity then
        raise exception 'Tank stock would exceed its capacity. Verify the corrected reading for %.', v_nozzle.label
          using errcode = '23514';
      end if;

      -- Corrections are appended, never overwrite the original sale movement.
      -- reference_line_id remains null so a shift can be corrected more than
      -- once without colliding with the immutable sale-line uniqueness guard.
      insert into public.stock_movements (
        station_id, tank_id, fuel_type, movement_type, quantity_litres,
        reference_type, reference_id, before_stock, after_stock,
        recorded_by, recorded_by_name, note
      ) values (
        p_station_id, v_tank.id, v_tank.fuel_type, 'correction', v_stock_delta,
        'shift_correction', p_shift_id, v_tank.current_stock, v_after_stock,
        auth.uid(), coalesce(v_profile.name, ''),
        'Correction to ' || v_nozzle.label || ' while resubmitting a sent-back shift'
      );
      update public.tanks set current_stock = v_after_stock where id = v_tank.id;
      update public.nozzles set last_reading = v_closing where id = v_nozzle.nozzle_id;
      update public.shift_nozzles
      set closing_reading = v_closing
      where id = v_nozzle.id;
    end if;
  end loop;

  /* Expenses --------------------------------------------------------- */
  delete from public.shift_expenses where shift_id = p_shift_id;
  for v_expense in select value from jsonb_array_elements(coalesce(p_expenses, '[]'::jsonb)) loop
    v_label := btrim(coalesce(v_expense ->> 'label', ''));
    begin
      v_amount := coalesce(
        nullif(btrim(coalesce(v_expense ->> 'amount', '')), '')::numeric,
        0
      );
    exception when invalid_text_representation then
      raise exception 'Expense amount is invalid.' using errcode = '22023';
    end;
    if char_length(v_label) not between 1 and 80 or v_amount <= 0 then
      raise exception 'Expense label and amount greater than zero are required.'
        using errcode = '22023';
    end if;
    insert into public.shift_expenses (shift_id, label, amount)
    values (p_shift_id, v_label, v_amount);
  end loop;

  /* Preserve and replace credit rows safely ------------------------- */
  -- A rejected submission is a correction, not permission to erase financial
  -- history. Reverse each active row, retain it as voided, and append an audit
  -- event before creating the corrected rows below.
  for v_transaction in
    select *
    from public.customer_transactions
    where shift_id = p_shift_id
      and type = 'credit'
      and status = 'active'
    order by recorded_at, id
    for update
  loop
    select * into v_customer
    from public.credit_customers
    where id = v_transaction.customer_id and station_id = p_station_id
    for update;
    if not found then
      raise exception 'Customer linked to this shift was not found.' using errcode = 'P0002';
    end if;
    if v_customer.outstanding_balance < v_transaction.amount then
      raise exception 'Credit from this shift has already been settled. Ask an owner or manager to correct it.'
        using errcode = '55000';
    end if;

    update public.credit_customers
    set outstanding_balance = outstanding_balance - v_transaction.amount
    where id = v_customer.id;

    update public.customer_transactions
    set
      status = 'voided',
      void_reason = 'Replaced when rejected shift was resubmitted',
      voided_by = auth.uid(),
      voided_by_name = coalesce(v_profile.name, ''),
      voided_at = now()
    where id = v_transaction.id;

    insert into public.customer_transaction_audit (
      transaction_id, customer_id, station_id, shift_id, action,
      old_amount, new_amount, old_customer_id, reason, acted_by, acted_by_name
    ) values (
      v_transaction.id, v_transaction.customer_id, p_station_id, p_shift_id, 'voided',
      v_transaction.amount, null, v_transaction.customer_id,
      'Replaced when rejected shift was resubmitted',
      auth.uid(), coalesce(v_profile.name, '')
    );
  end loop;

  for v_sale in select value from jsonb_array_elements(coalesce(p_credit_sales, '[]'::jsonb)) loop
    begin
      v_amount := coalesce(
        nullif(btrim(coalesce(v_sale ->> 'amount', '')), '')::numeric,
        0
      );
    exception when invalid_text_representation then
      raise exception 'Credit sale amount is invalid.' using errcode = '22023';
    end;
    if v_amount <= 0 then
      raise exception 'Credit sale amount must be greater than zero.' using errcode = '22023';
    end if;
    if v_amount > 10000000 then
      raise exception 'That credit amount is too large.' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_sale ->> 'name', ''));
    v_phone := btrim(coalesce(v_sale ->> 'phone', ''));

    if nullif(v_sale ->> 'customerId', '') is not null then
      begin
        v_customer_id := (v_sale ->> 'customerId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Credit customer is invalid.' using errcode = '22023';
      end;
      select * into v_customer
      from public.credit_customers
      where id = v_customer_id and station_id = p_station_id
      for update;
      if not found then
        raise exception 'Customer not found.' using errcode = 'P0002';
      end if;
    else
      -- One shared resolver: a phone match (compared as digits, so formatting
      -- never splits an account) or an exact name match for phone-less
      -- walk-ins reuses the existing account instead of inserting a duplicate.
      v_customer := (
        select f.customer
        from public.find_or_create_customer(p_station_id, v_name, v_phone, p_shift_id) f
      );
      v_customer_id := v_customer.id;
    end if;

    if v_customer.archived_at is not null then
      raise exception 'Restore this customer before recording credit.' using errcode = '55000';
    end if;

    update public.credit_customers
    set outstanding_balance = outstanding_balance + v_amount
    where id = v_customer_id
    returning * into v_customer;

    insert into public.customer_transactions (
      station_id, customer_id, shift_id, transaction_date, type, amount, note,
      recorded_by, recorded_by_name
    ) values (
      p_station_id, v_customer_id, p_shift_id, current_date, 'credit', v_amount,
      v_shift.employee_name || ' shift correction', auth.uid(), coalesce(v_profile.name, '')
    ) returning * into v_transaction;

    insert into public.customer_transaction_audit (
      transaction_id, customer_id, station_id, shift_id, action,
      old_amount, new_amount, new_customer_id, reason, acted_by, acted_by_name
    ) values (
      v_transaction.id, v_customer_id, p_station_id, p_shift_id, 'created',
      null, v_amount, v_customer_id, 'Rejected shift resubmission',
      auth.uid(), coalesce(v_profile.name, '')
    );
  end loop;

  update public.shifts
  set
    payments = jsonb_build_object(
      'cash', public.json_amount(p_payments, 'cash'),
      'card', public.json_amount(p_payments, 'card'),
      'upi', public.json_amount(p_payments, 'upi'),
      'credit', 0,
      'other', public.json_amount(p_payments, 'other')
    ),
    testing = jsonb_build_object(
      'MS', public.json_amount(p_testing, 'MS'),
      'HSD', public.json_amount(p_testing, 'HSD')
    ),
    credit_sales = '[]'::jsonb,
    note = btrim(coalesce(p_note, '')),
    status = 'pending_review',
    rejection_reason = null,
    revised_by = auth.uid(),
    revised_by_name = coalesce(v_profile.name, ''),
    revised_at = now()
  where id = p_shift_id;

  perform public.refresh_shift_credit_snapshot(p_shift_id);

  return jsonb_build_object('ok', true, 'shiftId', p_shift_id, 'status', 'pending_review');
end;
$$;

comment on function public.resubmit_rejected_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb) is
  'Lets the operator correct and resubmit their own rejected shift while reconciling stock, credit, and expenses atomically.';

revoke execute on function public.resubmit_rejected_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb) from public;
grant execute on function public.resubmit_rejected_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb) to authenticated;
