-- Credit ledger upgrade: shift-aware credit, correction/void instead of
-- deletion, and a full audit trail.
--
-- Additive by design. Nothing here replaces the existing credit architecture:
--   * credit_customers / customer_transactions keep their columns, their RLS
--     policies (owner + manager read only), and their attendant write guard.
--   * close_shift, record_customer_transaction, create_customer,
--     archive_customer, restore_customer are all untouched and keep working.
--   * customer_transactions.shift_id already exists and stays nullable, so
--     historical rows without a shift remain valid.
--
-- What is new:
--   1. A lifecycle on a transaction row: 'active' or 'voided', plus the
--      edit/void provenance columns.
--   2. public.customer_transaction_audit — one row per create/edit/void.
--   3. SECURITY DEFINER RPCs that are the only write path for shift credit:
--      add_shift_credit, update_customer_credit, void_customer_credit.
--   4. Read RPCs: list_shift_credit (attendant-safe, balance-free),
--      list_customer_transactions, credit_day_summary, shift_credit_review.
--
-- Authorisation is in PostgreSQL, never only in React:
--   attendant  — may add credit on their own OPEN shift, and edit/void their
--                own row while that shift is not approved. Never reads a
--                balance, never sees another attendant's row.
--   manager    — existing financial visibility, plus the review reads.
--   owner      — edit and void anything on their own station, with a reason.

/* ------------------------------------------------------------------ */
/* 1. Transaction lifecycle columns                                     */
/* ------------------------------------------------------------------ */

alter table public.customer_transactions
  add column if not exists status text not null default 'active',
  add column if not exists void_reason text not null default '',
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists voided_by_name text not null default '',
  add column if not exists voided_at timestamptz,
  add column if not exists edit_count integer not null default 0,
  add column if not exists edited_by uuid references public.profiles(id),
  add column if not exists edited_by_name text not null default '',
  add column if not exists edited_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_transactions'::regclass
      and conname = 'customer_transactions_status_check'
  ) then
    alter table public.customer_transactions
      add constraint customer_transactions_status_check
      check (status in ('active', 'voided'));
  end if;
end $$;

comment on column public.customer_transactions.status is
  'active | voided. A voided row keeps its amount for audit; its financial effect has been reversed on the customer balance.';

/* Indexes that materially support the ledger, review, and filter reads. */
create index if not exists customer_transactions_station_date_idx
  on public.customer_transactions (station_id, transaction_date desc, recorded_at desc);
create index if not exists customer_transactions_shift_idx
  on public.customer_transactions (shift_id) where shift_id is not null;
create index if not exists customer_transactions_recorded_by_idx
  on public.customer_transactions (station_id, recorded_by);
create index if not exists customer_transactions_status_idx
  on public.customer_transactions (station_id, status) where status <> 'active';

/* ------------------------------------------------------------------ */
/* 2. Audit trail                                                       */
/* ------------------------------------------------------------------ */

create table if not exists public.customer_transaction_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.customer_transactions(id) on delete restrict,
  customer_id uuid not null references public.credit_customers(id) on delete restrict,
  station_id uuid not null references public.stations(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete restrict,
  action text not null check (action in ('created', 'edited', 'voided')),
  old_amount numeric(12,2),
  new_amount numeric(12,2),
  old_customer_id uuid references public.credit_customers(id),
  new_customer_id uuid references public.credit_customers(id),
  reason text not null default '',
  acted_by uuid not null references public.profiles(id),
  acted_by_name text not null default '',
  acted_at timestamptz not null default now()
);

create index if not exists customer_transaction_audit_tx_idx
  on public.customer_transaction_audit (transaction_id, acted_at);
create index if not exists customer_transaction_audit_shift_idx
  on public.customer_transaction_audit (shift_id, acted_at) where shift_id is not null;
create index if not exists customer_transaction_audit_station_idx
  on public.customer_transaction_audit (station_id, acted_at desc);

alter table public.customer_transaction_audit enable row level security;
drop policy if exists customer_transaction_audit_read on public.customer_transaction_audit;
create policy customer_transaction_audit_read on public.customer_transaction_audit
  for select to authenticated
  using (public.can_manage_station(station_id));

revoke all on public.customer_transaction_audit from public;
grant select on public.customer_transaction_audit to authenticated;

-- Attendants may never write the audit table by hand; the RPC layer writes it
-- as the function owner, exactly like the credit tables.
drop trigger if exists customer_transaction_audit_guard_attendant on public.customer_transaction_audit;
create trigger customer_transaction_audit_guard_attendant
before insert or update or delete on public.customer_transaction_audit
for each row execute function public.guard_attendant_writes();

/* The attendant write guard must admit the audit table on the same terms as
   the credit tables: through a trusted SECURITY DEFINER RPC only. */
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

  -- Stock, credit, and credit-audit tables: a SECURITY DEFINER RPC executes
  -- as the function owner, never as `authenticated`/`anon`, so this admits
  -- only the RPC layer's own writes. A direct PostgREST write still arrives
  -- as `authenticated` and is refused below.
  if tg_table_name in (
       'tanks', 'tank_readings', 'credit_customers',
       'customer_transactions', 'customer_transaction_audit'
     )
     and current_user not in ('authenticated', 'anon') then
    return v_row;
  end if;

  raise exception 'Attendants cannot change % records.', replace(tg_table_name, '_', ' ')
    using errcode = '42501';
end;
$$;

comment on function public.guard_attendant_writes() is
  'Row-level backstop: attendants may only touch their own shift rows; stock, credit, and credit-audit rows only through the trusted RPC layer, never directly.';

/* ------------------------------------------------------------------ */
/* 3. Shared permission helper for a credit row                         */
/* ------------------------------------------------------------------ */

-- Who may change this transaction right now, decided in the database.
--   owner of the station        -> always (edit + void, with a reason)
--   attendant who recorded it   -> only while their own shift is not approved
--   everyone else               -> never
-- Raises rather than returning false so every RPC gives the same message.
create or replace function public.assert_can_modify_credit(p_transaction public.customer_transactions)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.account_role;
  v_shift public.shifts;
begin
  perform public.assert_station_access(p_transaction.station_id);
  v_role := public.current_account_role();

  if v_role = 'owner'::public.account_role then
    perform public.assert_owner_station(p_transaction.station_id);
    return;
  end if;

  if v_role = 'attendant'::public.account_role then
    if p_transaction.recorded_by is distinct from auth.uid() then
      raise exception 'You can only change credit you recorded yourself.' using errcode = '42501';
    end if;
    if p_transaction.shift_id is null then
      raise exception 'This credit is not linked to one of your shifts.' using errcode = '42501';
    end if;
    select * into v_shift from public.shifts where id = p_transaction.shift_id;
    if not found or v_shift.employee_id is distinct from auth.uid() then
      raise exception 'You can only change credit on your own shift.' using errcode = '42501';
    end if;
    if v_shift.status = 'approved'::public.shift_status then
      raise exception 'This credit belongs to an approved shift and can no longer be changed.'
        using errcode = '55000';
    end if;
    return;
  end if;

  raise exception 'Only the owner can correct a recorded credit.' using errcode = '42501';
end;
$$;

revoke execute on function public.assert_can_modify_credit(public.customer_transactions) from public;
grant execute on function public.assert_can_modify_credit(public.customer_transactions) to authenticated;

/* ------------------------------------------------------------------ */
/* 4. Write RPCs                                                        */
/* ------------------------------------------------------------------ */

-- Credit taken during a running shift, posted immediately instead of waiting
-- for the close screen. The attendant never learns the balance: the return
-- value carries one only for a caller who may already read the ledger.
create or replace function public.add_shift_credit(
  p_station_id uuid,
  p_shift_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_customer public.credit_customers;
  v_profile public.profiles;
  v_tx public.customer_transactions;
  v_role public.account_role;
begin
  perform public.assert_station_access(p_station_id);
  perform public.assert_station_is_active(p_station_id);
  v_role := public.current_account_role();

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a credit amount greater than zero.' using errcode = '22023';
  end if;
  if p_amount > 10000000 then
    raise exception 'That credit amount is too large.' using errcode = '22023';
  end if;

  select * into v_shift from public.shifts
  where id = p_shift_id and station_id = p_station_id
  for update;
  if not found then raise exception 'Shift not found.' using errcode = 'P0002'; end if;

  if v_role = 'attendant'::public.account_role then
    if v_shift.employee_id is distinct from auth.uid() then
      raise exception 'You can only add credit to your own shift.' using errcode = '42501';
    end if;
    if v_shift.status <> 'open'::public.shift_status then
      raise exception 'This shift is closed. Credit can only be added while the shift is running.'
        using errcode = '55000';
    end if;
  else
    perform public.assert_manager_station(p_station_id);
    if v_shift.status = 'approved'::public.shift_status then
      raise exception 'This shift is approved and can no longer take new credit.' using errcode = '55000';
    end if;
  end if;

  select * into v_customer from public.credit_customers
  where id = p_customer_id and station_id = p_station_id
  for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
  if v_customer.archived_at is not null then
    raise exception 'Restore this customer before recording credit.' using errcode = '55000';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  update public.credit_customers
  set outstanding_balance = outstanding_balance + p_amount
  where id = p_customer_id
  returning * into v_customer;

  insert into public.customer_transactions (
    station_id, customer_id, shift_id, transaction_date, type, amount, note,
    recorded_by, recorded_by_name
  ) values (
    p_station_id, p_customer_id, p_shift_id, current_date, 'credit', p_amount,
    btrim(coalesce(p_note, '')), auth.uid(), coalesce(v_profile.name, '')
  ) returning * into v_tx;

  insert into public.customer_transaction_audit (
    transaction_id, customer_id, station_id, shift_id, action,
    old_amount, new_amount, new_customer_id, reason, acted_by, acted_by_name
  ) values (
    v_tx.id, p_customer_id, p_station_id, p_shift_id, 'created',
    null, p_amount, p_customer_id, '', auth.uid(), coalesce(v_profile.name, '')
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_tx.id,
    'amount', v_tx.amount,
    'customerId', p_customer_id,
    'customerName', v_customer.name,
    'shiftId', p_shift_id,
    -- Deliberately absent for attendants: they must not learn what is owed.
    'outstandingBalance',
      case when public.can_manage_station(p_station_id) then v_customer.outstanding_balance end
  );
end;
$$;

comment on function public.add_shift_credit(uuid, uuid, uuid, numeric, text) is
  'Posts credit against a customer for a running shift. Attendants: own open shift only, no balance returned.';

-- Correct a mistaken amount. The balance moves by the delta computed here;
-- a frontend-supplied balance is never trusted.
create or replace function public.update_customer_credit(
  p_transaction_id uuid,
  p_amount numeric,
  p_reason text default '',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.customer_transactions;
  v_customer public.credit_customers;
  v_profile public.profiles;
  v_delta numeric;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_tx from public.customer_transactions where id = p_transaction_id for update;
  if not found then raise exception 'That credit entry no longer exists.' using errcode = 'P0002'; end if;

  perform public.assert_can_modify_credit(v_tx);

  if v_tx.status <> 'active' then
    raise exception 'This entry is already voided and cannot be edited.' using errcode = '55000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'Give a reason for this correction.' using errcode = '22023';
  end if;

  select * into v_customer from public.credit_customers
  where id = v_tx.customer_id and station_id = v_tx.station_id
  for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  v_delta := case when v_tx.type = 'credit' then p_amount - v_tx.amount
                  else v_tx.amount - p_amount end;

  if v_customer.outstanding_balance + v_delta < 0 then
    raise exception 'That correction would push this account below zero.' using errcode = '55000';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  update public.credit_customers
  set outstanding_balance = outstanding_balance + v_delta
  where id = v_customer.id
  returning * into v_customer;

  insert into public.customer_transaction_audit (
    transaction_id, customer_id, station_id, shift_id, action,
    old_amount, new_amount, old_customer_id, new_customer_id,
    reason, acted_by, acted_by_name
  ) values (
    v_tx.id, v_tx.customer_id, v_tx.station_id, v_tx.shift_id, 'edited',
    v_tx.amount, p_amount, v_tx.customer_id, v_tx.customer_id,
    v_reason, auth.uid(), coalesce(v_profile.name, '')
  );

  update public.customer_transactions
  set amount = p_amount,
      note = coalesce(btrim(p_note), note),
      edit_count = edit_count + 1,
      edited_by = auth.uid(),
      edited_by_name = coalesce(v_profile.name, ''),
      edited_at = now()
  where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object(
    'ok', true,
    'id', v_tx.id,
    'amount', v_tx.amount,
    'delta', v_delta,
    'outstandingBalance',
      case when public.can_manage_station(v_tx.station_id) then v_customer.outstanding_balance end
  );
end;
$$;

comment on function public.update_customer_credit(uuid, numeric, text, text) is
  'Corrects a transaction amount and moves the customer balance by the computed delta. Owner, or the attendant who recorded it while their shift is unapproved.';

-- Removing money from a financial record is a void, never a delete: the row
-- stays, its effect is reversed, and the reason is recorded.
create or replace function public.void_customer_credit(
  p_transaction_id uuid,
  p_reason text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.customer_transactions;
  v_customer public.credit_customers;
  v_profile public.profiles;
  v_delta numeric;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v_tx from public.customer_transactions where id = p_transaction_id for update;
  if not found then raise exception 'That credit entry no longer exists.' using errcode = 'P0002'; end if;

  perform public.assert_can_modify_credit(v_tx);

  if v_tx.status <> 'active' then
    raise exception 'This entry is already voided.' using errcode = '55000';
  end if;
  if v_reason = '' then
    raise exception 'Choose a reason before voiding this entry.' using errcode = '22023';
  end if;
  if lower(v_reason) = 'other' and v_note = '' then
    raise exception 'Add a note explaining why this entry is being voided.' using errcode = '22023';
  end if;
  if v_note <> '' then
    v_reason := v_reason || ' — ' || v_note;
  end if;

  select * into v_customer from public.credit_customers
  where id = v_tx.customer_id and station_id = v_tx.station_id
  for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  -- Exactly the reverse of what the entry did.
  v_delta := case when v_tx.type = 'credit' then -v_tx.amount else v_tx.amount end;
  if v_customer.outstanding_balance + v_delta < 0 then
    raise exception 'Voiding this entry would push the account below zero. Correct the later entries first.'
      using errcode = '55000';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  update public.credit_customers
  set outstanding_balance = outstanding_balance + v_delta
  where id = v_customer.id
  returning * into v_customer;

  update public.customer_transactions
  set status = 'voided',
      void_reason = v_reason,
      voided_by = auth.uid(),
      voided_by_name = coalesce(v_profile.name, ''),
      voided_at = now()
  where id = v_tx.id;

  insert into public.customer_transaction_audit (
    transaction_id, customer_id, station_id, shift_id, action,
    old_amount, new_amount, old_customer_id, reason, acted_by, acted_by_name
  ) values (
    v_tx.id, v_tx.customer_id, v_tx.station_id, v_tx.shift_id, 'voided',
    v_tx.amount, 0, v_tx.customer_id, v_reason, auth.uid(), coalesce(v_profile.name, '')
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_tx.id,
    'reversed', abs(v_delta),
    'outstandingBalance',
      case when public.can_manage_station(v_tx.station_id) then v_customer.outstanding_balance end
  );
end;
$$;

comment on function public.void_customer_credit(uuid, text, text) is
  'Voids a transaction: reverses its exact financial effect, records who/when/why, and keeps the row for audit. Never deletes financial history.';

/* ------------------------------------------------------------------ */
/* 5. Read RPCs                                                         */
/* ------------------------------------------------------------------ */

-- The attendant's own credit list for one shift. Balance-free by design, and
-- scoped to the rows that caller recorded: an attendant never sees a
-- co-worker's entry, and never sees what the customer owes.
create or replace function public.list_shift_credit(p_station_id uuid, p_shift_id uuid)
returns table (
  id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  amount numeric,
  note text,
  status text,
  void_reason text,
  edit_count integer,
  recorded_by uuid,
  recorded_by_name text,
  recorded_at timestamptz,
  can_edit boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_role public.account_role;
  v_mine boolean;
begin
  perform public.assert_station_access(p_station_id);
  v_role := public.current_account_role();
  select * into v_shift from public.shifts s
   where s.id = p_shift_id and s.station_id = p_station_id;
  if not found then raise exception 'Shift not found.' using errcode = 'P0002'; end if;

  if v_role = 'attendant'::public.account_role then
    if v_shift.employee_id is distinct from auth.uid() then
      raise exception 'You can only see credit on your own shift.' using errcode = '42501';
    end if;
  else
    perform public.assert_manager_station(p_station_id);
  end if;

  v_mine := v_role = 'attendant'::public.account_role;

  return query
    select t.id, t.customer_id, c.name, c.phone, t.amount, t.note, t.status,
           t.void_reason, t.edit_count, t.recorded_by, t.recorded_by_name, t.recorded_at,
           (t.status = 'active'
             and v_shift.status <> 'approved'::public.shift_status
             and (not v_mine or t.recorded_by = auth.uid())) as can_edit
    from public.customer_transactions t
    join public.credit_customers c on c.id = t.customer_id
    where t.shift_id = p_shift_id
      and t.station_id = p_station_id
      and t.type = 'credit'
      and (not v_mine or t.recorded_by = auth.uid())
    order by t.recorded_at;
end;
$$;

comment on function public.list_shift_credit(uuid, uuid) is
  'Credit entries for one shift. Attendants see only their own rows on their own shift, with no customer balance.';

-- The owner/manager ledger read, filtered in the database so a filter can
-- never be the only thing standing between a caller and another station.
create or replace function public.list_customer_transactions(
  p_station_id uuid,
  p_customer_id uuid default null,
  p_recorded_by uuid default null,
  p_shift_id uuid default null,
  p_status text default 'all',
  p_from date default null,
  p_to date default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  customer_id uuid,
  customer_name text,
  shift_id uuid,
  shift_label text,
  shift_status text,
  transaction_date date,
  type text,
  amount numeric,
  note text,
  status text,
  void_reason text,
  voided_by_name text,
  voided_at timestamptz,
  edit_count integer,
  edited_by_name text,
  edited_at timestamptz,
  recorded_by uuid,
  recorded_by_name text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_status text := lower(coalesce(nullif(btrim(p_status), ''), 'all'));
begin
  perform public.assert_manager_station(p_station_id);
  if v_status not in ('all', 'active', 'edited', 'voided') then
    raise exception 'Unknown transaction status filter.' using errcode = '22023';
  end if;

  return query
    select t.id, t.customer_id, c.name, t.shift_id,
           case when s.id is null then null
                else coalesce(s.employee_name, '') || ' · ' || to_char(s.shift_date, 'DD Mon')
           end as shift_label,
           case when s.id is null then null else s.status::text end as shift_status,
           t.transaction_date, t.type, t.amount, t.note, t.status, t.void_reason,
           t.voided_by_name, t.voided_at, t.edit_count, t.edited_by_name, t.edited_at,
           t.recorded_by, t.recorded_by_name, t.recorded_at
    from public.customer_transactions t
    join public.credit_customers c on c.id = t.customer_id
    left join public.shifts s on s.id = t.shift_id
    where t.station_id = p_station_id
      and (p_customer_id is null or t.customer_id = p_customer_id)
      and (p_recorded_by is null or t.recorded_by = p_recorded_by)
      and (p_shift_id is null or t.shift_id = p_shift_id)
      and (p_from is null or t.transaction_date >= p_from)
      and (p_to is null or t.transaction_date <= p_to)
      and (
        v_status = 'all'
        or (v_status = 'active' and t.status = 'active')
        or (v_status = 'voided' and t.status = 'voided')
        or (v_status = 'edited' and t.edit_count > 0)
      )
    order by t.transaction_date desc, t.recorded_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$$;

comment on function public.list_customer_transactions(uuid, uuid, uuid, uuid, text, date, date, integer) is
  'Owner/manager ledger read with customer, attendant, shift, status, and date filters applied in SQL.';

-- One aggregate instead of loading every customer's history into the browser.
create or replace function public.credit_day_summary(p_station_id uuid, p_day date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_row record; v_day date := coalesce(p_day, current_date);
begin
  perform public.assert_manager_station(p_station_id);
  select
    coalesce(sum(case when type = 'credit' then amount else 0 end), 0) as credit_given,
    coalesce(sum(case when type = 'payment' then amount else 0 end), 0) as payments,
    count(*) as entries,
    count(distinct customer_id) as customers,
    count(distinct recorded_by) as attendants
  into v_row
  from public.customer_transactions
  where station_id = p_station_id
    and transaction_date = v_day
    and status = 'active';  -- voided entries never count towards a total

  return jsonb_build_object(
    'day', v_day,
    'creditGiven', v_row.credit_given,
    'payments', v_row.payments,
    'netCredit', v_row.credit_given - v_row.payments,
    'entries', v_row.entries,
    'customers', v_row.customers,
    'attendants', v_row.attendants
  );
end;
$$;

comment on function public.credit_day_summary(uuid, date) is
  'Credit given, payments, net, and counts for one day. Voided entries are excluded from every figure.';

-- What the shift review needs to flag: how many credit entries, how many were
-- corrected, how many voided, and the detail behind each flag.
create or replace function public.shift_credit_review(p_station_id uuid, p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_entries int; v_modified int; v_voided int; v_total numeric; v_items jsonb;
begin
  perform public.assert_manager_station(p_station_id);
  if not exists (select 1 from public.shifts where id = p_shift_id and station_id = p_station_id) then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;

  select count(*),
         count(*) filter (where edit_count > 0),
         count(*) filter (where status = 'voided'),
         coalesce(sum(amount) filter (where status = 'active'), 0)
  into v_entries, v_modified, v_voided, v_total
  from public.customer_transactions
  where shift_id = p_shift_id and station_id = p_station_id and type = 'credit';

  select coalesce(jsonb_agg(item order by item ->> 'actedAt'), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id', a.id,
      'transactionId', a.transaction_id,
      'action', a.action,
      'customerName', c.name,
      'oldAmount', a.old_amount,
      'newAmount', a.new_amount,
      'reason', a.reason,
      'actedByName', a.acted_by_name,
      'actedAt', a.acted_at
    ) as item
    from public.customer_transaction_audit a
    join public.credit_customers c on c.id = a.customer_id
    where a.shift_id = p_shift_id
      and a.station_id = p_station_id
      and a.action in ('edited', 'voided')
  ) flagged;

  return jsonb_build_object(
    'entries', v_entries,
    'modified', v_modified,
    'voided', v_voided,
    'total', v_total,
    'items', v_items
  );
end;
$$;

comment on function public.shift_credit_review(uuid, uuid) is
  'Credit review indicators for one shift: entry count, corrected count, voided count, and the audit detail behind each.';

/* ------------------------------------------------------------------ */
/* 6. Grants: nothing broad, authenticated only                         */
/* ------------------------------------------------------------------ */

revoke execute on function public.add_shift_credit(uuid, uuid, uuid, numeric, text) from public;
revoke execute on function public.update_customer_credit(uuid, numeric, text, text) from public;
revoke execute on function public.void_customer_credit(uuid, text, text) from public;
revoke execute on function public.list_shift_credit(uuid, uuid) from public;
revoke execute on function public.list_customer_transactions(uuid, uuid, uuid, uuid, text, date, date, integer) from public;
revoke execute on function public.credit_day_summary(uuid, date) from public;
revoke execute on function public.shift_credit_review(uuid, uuid) from public;

grant execute on function public.add_shift_credit(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.update_customer_credit(uuid, numeric, text, text) to authenticated;
grant execute on function public.void_customer_credit(uuid, text, text) to authenticated;
grant execute on function public.list_shift_credit(uuid, uuid) to authenticated;
grant execute on function public.list_customer_transactions(uuid, uuid, uuid, uuid, text, date, date, integer) to authenticated;
grant execute on function public.credit_day_summary(uuid, date) to authenticated;
grant execute on function public.shift_credit_review(uuid, uuid) to authenticated;
