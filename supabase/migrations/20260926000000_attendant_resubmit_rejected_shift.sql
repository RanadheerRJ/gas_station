-- A shift sent back by its reviewer is still a closed record: its original
-- close time, nozzle assignments, and audit trail stay intact. Its attendant
-- may, however, correct the submitted figures and return it to pending review.
--
-- This is intentionally not an extension of revise_shift. That RPC is for a
-- manager/owner correcting a reviewed record; this one is narrowly scoped to
-- an attendant's OWN rejected shift, and replays all of the related financial
-- and stock changes atomically.
--
-- A correction can add stock back (positive) or deduct extra stock (negative).
-- The original ledger allowed a negative quantity only for a sale, so extend
-- that direction rule to the correction movement used below. Find the legacy
-- unnamed CHECK by its expression rather than assuming the generated name.
do $$
declare v_constraint name;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.stock_movements'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ~ 'quantity_litres.*>=.*0'
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.stock_movements drop constraint %I', v_constraint);
  end if;
end;
$$;

alter table public.stock_movements
  add constraint stock_movements_quantity_direction_check
  check (movement_type in ('sale', 'correction') or quantity_litres >= 0);

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
  v_credit_total record;
  v_sale jsonb;
  v_customer_id uuid;
  v_customer public.credit_customers;
  v_name text;
  v_phone text;
  v_credit_rows jsonb := '[]'::jsonb;
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
     and later_payment.recorded_at > old_credit.recorded_at
    where old_credit.shift_id = p_shift_id
      and old_credit.type = 'credit'
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

  /* Replace credit rows safely -------------------------------------- */
  for v_credit_total in
    select customer_id, sum(amount) as amount
    from public.customer_transactions
    where shift_id = p_shift_id and type = 'credit'
    group by customer_id
  loop
    select * into v_customer
    from public.credit_customers
    where id = v_credit_total.customer_id and station_id = p_station_id
    for update;
    if not found then
      raise exception 'Customer linked to this shift was not found.' using errcode = 'P0002';
    end if;
    if v_customer.outstanding_balance < v_credit_total.amount then
      raise exception 'Credit from this shift has already been settled. Ask an owner or manager to correct it.'
        using errcode = '55000';
    end if;
    update public.credit_customers
    set outstanding_balance = outstanding_balance - v_credit_total.amount
    where id = v_customer.id;
  end loop;
  delete from public.customer_transactions
  where shift_id = p_shift_id and type = 'credit';

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
        raise exception 'Customer not found.' using errcode = 'P0002'; end if;
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
      v_shift.employee_name || ' shift correction', auth.uid(), coalesce(v_profile.name, '')
    );
    v_credit_rows := v_credit_rows || jsonb_build_array(jsonb_build_object(
      'customerId', v_customer_id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'amount', v_amount
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
    rejection_reason = null,
    revised_by = auth.uid(),
    revised_by_name = coalesce(v_profile.name, ''),
    revised_at = now()
  where id = p_shift_id;

  return jsonb_build_object('ok', true, 'shiftId', p_shift_id, 'status', 'pending_review');
end;
$$;

comment on function public.resubmit_rejected_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb) is
  'Lets the operator correct and resubmit their own rejected shift while reconciling stock, credit, and expenses atomically.';

revoke execute on function public.resubmit_rejected_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb) from public;
grant execute on function public.resubmit_rejected_shift(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb) to authenticated;
