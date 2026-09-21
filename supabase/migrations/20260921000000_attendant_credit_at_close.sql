-- Attendants can now record credit sales while closing their own shift —
-- against an existing customer or a new walk-in — instead of handing a paper
-- docket to the manager to key in afterwards.
--
-- What does NOT change:
--   * The credit ledger screens, balances, and transaction history stay
--     owner/manager-only: the customers_read / customer_transactions_read
--     policies are untouched, so an attendant still cannot select either
--     table.
--   * create_customer and record_customer_transaction still assert
--     owner/manager, so an attendant cannot open an account or move a
--     balance (credit or payment) outside a shift close.
--   * Direct PostgREST writes to the credit tables stay blocked.
--
-- How it works, in two pieces:
--   1. guard_attendant_writes() extends the trusted-RPC pass (introduced for
--      tanks/tank_readings in 20260920190000) to credit_customers and
--      customer_transactions. A SECURITY DEFINER RPC executes as the function
--      owner, never as `authenticated`/`anon`, so the pass admits exactly the
--      RPC layer's own writes. The only credit-writing RPC an attendant can
--      reach is close_shift: create_customer and record_customer_transaction
--      raise at assert_manager_station before touching a row. And close_shift
--      can only complete against the caller's own shift — the shifts and
--      shift_nozzles guard branches abort the whole transaction for anyone
--      else's — so every attendant credit row is tied to their own shift,
--      stamped with recorded_by, and lands in a shift that still goes to
--      pending_review for a manager to approve.
--   2. list_customer_directory() gives the close-shift screen a way to
--      attribute a sale to an existing account without opening the ledger:
--      id, name, and phone only — no balance, no history.

/* ------------------------------------------------------------------ */
/* 1. Let close_shift post credit for the attendant on shift            */
/* ------------------------------------------------------------------ */

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

  -- Stock and credit tables: a SECURITY DEFINER RPC (close_shift posting
  -- meter sales and credit sales, record_dip writing an observation)
  -- executes as the function owner, never as `authenticated`/`anon`, so this
  -- passes only the RPC layer's own writes. A direct PostgREST table write
  -- still arrives as `authenticated` and falls through to the block below.
  -- The credit RPCs an attendant could call by hand (create_customer,
  -- record_customer_transaction) assert owner/manager before writing, so the
  -- only attendant path through here is close_shift — which the branches
  -- above pin to their own shift.
  if tg_table_name in ('tanks', 'tank_readings', 'credit_customers', 'customer_transactions')
     and current_user not in ('authenticated', 'anon') then
    return v_row;
  end if;

  -- fuel_prices — and any direct write to the tables above: entirely out of
  -- bounds for an attendant.
  raise exception 'Attendants cannot change % records.', replace(tg_table_name, '_', ' ')
    using errcode = '42501';
end;
$$;

comment on function public.guard_attendant_writes() is
  'Row-level backstop: attendants may only touch their own shift rows; stock and credit rows only through the trusted RPC layer (close_shift, record_dip), never directly.';

/* ------------------------------------------------------------------ */
/* 2. A balance-free customer directory for the close-shift screen      */
/* ------------------------------------------------------------------ */

-- The ledger itself (balances, transaction history) stays owner/manager-only
-- via the customers_read policy. This RPC exposes just enough to attribute a
-- credit sale to the right account: id, name, phone. Nothing financial.
create or replace function public.list_customer_directory(p_station_id uuid)
returns table (id uuid, name text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_station_access(p_station_id);
  return query
    select c.id, c.name, c.phone
    from public.credit_customers c
    where c.station_id = p_station_id
    order by c.name;
end;
$$;

comment on function public.list_customer_directory(uuid) is
  'Customer id/name/phone for attributing a credit sale at shift close. Deliberately balance-free so attendants can pick an account without reading the ledger.';

revoke execute on function public.list_customer_directory(uuid) from public;
grant execute on function public.list_customer_directory(uuid) to authenticated;
