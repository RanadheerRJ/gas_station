-- Make shift-linked customer transactions the single source of truth for a
-- shift's credit total. The running-shift screen posts those transactions as
-- they happen; every shift snapshot now follows that ledger automatically.

/* ------------------------------------------------------------------ */
/* Authoritative shift snapshot                                        */
/* ------------------------------------------------------------------ */

create or replace function public.refresh_shift_credit_snapshot(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_total numeric;
begin
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'transactionId', t.id,
          'customerId', t.customer_id,
          'name', c.name,
          'phone', c.phone,
          'amount', t.amount
        ) order by t.recorded_at, t.id
      ),
      '[]'::jsonb
    ),
    coalesce(sum(t.amount), 0)
  into v_rows, v_total
  from public.customer_transactions t
  join public.credit_customers c on c.id = t.customer_id
  where t.shift_id = p_shift_id
    and t.type = 'credit'
    and t.status = 'active';

  update public.shifts
  set
    credit_sales = v_rows,
    payments = jsonb_set(
      coalesce(payments, '{}'::jsonb),
      '{credit}',
      to_jsonb(v_total),
      true
    )
  where id = p_shift_id;
end;
$$;

comment on function public.refresh_shift_credit_snapshot(uuid) is
  'Internal helper that derives shifts.credit_sales and payments.credit from active shift-linked credit transactions.';

revoke execute on function public.refresh_shift_credit_snapshot(uuid) from public;
revoke execute on function public.refresh_shift_credit_snapshot(uuid) from anon, authenticated;

create or replace function public.sync_shift_credit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and old.type = 'credit'
     and old.shift_id is not null then
    perform public.refresh_shift_credit_snapshot(old.shift_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.type = 'credit'
     and new.shift_id is not null
     and (
       tg_op <> 'UPDATE'
       or new.shift_id is distinct from old.shift_id
       or old.type is distinct from 'credit'
     ) then
    perform public.refresh_shift_credit_snapshot(new.shift_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.sync_shift_credit_snapshot() is
  'Keeps the denormalized shift credit snapshot synchronized after every shift-linked credit insert, edit, void, reassignment, or delete.';

revoke execute on function public.sync_shift_credit_snapshot() from public;
revoke execute on function public.sync_shift_credit_snapshot() from anon, authenticated;

drop trigger if exists customer_transactions_sync_shift_credit on public.customer_transactions;
create trigger customer_transactions_sync_shift_credit
after insert or update of amount, status, customer_id, shift_id, type or delete
on public.customer_transactions
for each row execute function public.sync_shift_credit_snapshot();

-- Repair snapshots created before running-shift credit became authoritative.
do $$
declare
  v_shift record;
begin
  for v_shift in
    select s.id
    from public.shifts s
    where s.credit_sales <> '[]'::jsonb
       or exists (
         select 1
         from public.customer_transactions t
         where t.shift_id = s.id and t.type = 'credit'
       )
  loop
    perform public.refresh_shift_credit_snapshot(v_shift.id);
  end loop;
end;
$$;

/* ------------------------------------------------------------------ */
/* Close a shift without reposting credit already recorded while open  */
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
    elsif v_phone <> '' then
      select * into v_customer
      from public.credit_customers
      where station_id = p_station_id and phone = v_phone
      order by created_at
      limit 1
      for update;
      if found then
        v_customer_id := v_customer.id;
      else
        insert into public.credit_customers (station_id, name, phone, created_from_shift)
        values (
          p_station_id,
          coalesce(nullif(v_name, ''), 'Walk-in'),
          v_phone,
          p_shift_id
        )
        returning * into v_customer;
        v_customer_id := v_customer.id;
      end if;
    else
      insert into public.credit_customers (station_id, name, phone, created_from_shift)
      values (
        p_station_id,
        coalesce(nullif(v_name, ''), 'Walk-in'),
        '',
        p_shift_id
      )
      returning * into v_customer;
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
