-- ---------------------------------------------------------------------------
-- HOTFIX: restore the archived-customer columns and RPCs that
-- 20260926020000_archive_credit_customers.sql was supposed to add.
--
-- Symptom this fixes:
--   Closing a shift (or adding credit on a running shift) fails with
--     record "v_customer" has no field "archived_at"
--   The credit-ledger migrations of 20261005* replaced close_shift,
--   add_shift_credit, and resubmit_rejected_shift with versions that read
--   credit_customers.archived_at — a column introduced by
--   supabase/migrations/20260926020000_archive_credit_customers.sql. On a
--   project where that migration never actually ran, the newer functions were
--   still created (CREATE FUNCTION does not validate record field access), so
--   everything worked until the first close_shift touched a credit sale.
--
-- This is an idempotent re-statement of that single migration. Safe to run
-- more than once, and safe on a database that already has the column: every
-- statement is add-if-not-exists, create-or-replace, or drop-then-create.
-- Paste into Supabase Dashboard -> SQL Editor and run as one script.
--
-- Preferred alternative (keeps migration history in sync):
--   supabase link --project-ref YOUR_PROJECT_REF
--   supabase db push
-- db push applies every pending migration in order, so if the ledger shows
-- other versions missing this fixes them too. If you run THIS script instead
-- of db push and `supabase migration list` still shows 20260926020000 as
-- pending, reconcile history afterwards:
--   supabase migration repair --status applied 20260926020000
-- ---------------------------------------------------------------------------

/* ------------------------------------------------------------------ */
/* 1. Soft-archive columns on credit_customers                          */
/* ------------------------------------------------------------------ */

alter table public.credit_customers add column if not exists archived_at timestamptz;
alter table public.credit_customers add column if not exists archived_by uuid references public.profiles(id);
create index if not exists credit_customers_archived_idx on public.credit_customers (station_id, archived_at);

/* ------------------------------------------------------------------ */
/* 2. Archive/restore audit trail                                       */
/* ------------------------------------------------------------------ */

create table if not exists public.customer_audit (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  customer_id uuid not null references public.credit_customers(id) on delete restrict,
  action text not null check (action in ('archived', 'restored')),
  acted_by uuid not null references public.profiles(id),
  acted_at timestamptz not null default now()
);

alter table public.customer_audit enable row level security;
drop policy if exists customer_audit_read on public.customer_audit;
create policy customer_audit_read on public.customer_audit for select to authenticated
  using (public.can_manage_station(station_id));
revoke all on public.customer_audit from public;
grant select on public.customer_audit to authenticated;

/* ------------------------------------------------------------------ */
/* 3. Archive / restore RPCs                                            */
/* ------------------------------------------------------------------ */

create or replace function public.archive_customer(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_customer public.credit_customers; v_station uuid;
begin
  select * into v_customer from public.credit_customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
  v_station := v_customer.station_id;
  perform public.assert_manager_station(v_station);
  if v_customer.archived_at is null then
    update public.credit_customers set archived_at = now(), archived_by = auth.uid() where id = p_customer_id;
    insert into public.customer_audit(station_id, customer_id, action, acted_by)
      values (v_station, p_customer_id, 'archived', auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'archived', true);
end; $$;

create or replace function public.restore_customer(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_customer public.credit_customers; v_station uuid;
begin
  select * into v_customer from public.credit_customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
  v_station := v_customer.station_id;
  perform public.assert_manager_station(v_station);
  if v_customer.archived_at is not null then
    update public.credit_customers set archived_at = null, archived_by = null where id = p_customer_id;
    insert into public.customer_audit(station_id, customer_id, action, acted_by)
      values (v_station, p_customer_id, 'restored', auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'archived', false);
end; $$;

revoke execute on function public.archive_customer(uuid), public.restore_customer(uuid) from public;
grant execute on function public.archive_customer(uuid), public.restore_customer(uuid) to authenticated;

/* ------------------------------------------------------------------ */
/* 4. Balance-free directory hides archived accounts                    */
/* ------------------------------------------------------------------ */

create or replace function public.list_customer_directory(p_station_id uuid)
returns table (id uuid, name text, phone text) language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_station_access(p_station_id);
  return query select c.id, c.name, c.phone from public.credit_customers c
    where c.station_id = p_station_id and c.archived_at is null order by c.name;
end; $$;
revoke execute on function public.list_customer_directory(uuid) from public;
grant execute on function public.list_customer_directory(uuid) to authenticated;

/* ------------------------------------------------------------------ */
/* 5. Manager ledger RPC rejects archived accounts                      */
/* ------------------------------------------------------------------ */

create or replace function public.record_customer_transaction(
  p_station_id uuid, p_customer_id uuid, p_type text, p_amount numeric,
  p_note text default '', p_date date default current_date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_customer public.credit_customers; v_profile public.profiles; v_delta numeric;
begin
  perform public.assert_manager_station(p_station_id);
  if p_type not in ('credit', 'payment') or p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid transaction and amount greater than zero.' using errcode = '22023'; end if;
  select * into v_customer from public.credit_customers where id = p_customer_id and station_id = p_station_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
  if v_customer.archived_at is not null then raise exception 'Restore this customer before recording a transaction.' using errcode = '55000'; end if;
  if p_type = 'payment' and p_amount > v_customer.outstanding_balance then
    raise exception 'That is more than the % outstanding on this account.', v_customer.outstanding_balance using errcode = '55000'; end if;
  v_delta := case when p_type = 'credit' then p_amount else -p_amount end;
  select * into v_profile from public.profiles where id = auth.uid();
  update public.credit_customers set outstanding_balance = outstanding_balance + v_delta where id = p_customer_id returning * into v_customer;
  insert into public.customer_transactions(station_id, customer_id, transaction_date, type, amount, note, recorded_by, recorded_by_name)
    values(p_station_id, p_customer_id, coalesce(p_date,current_date), p_type, p_amount, btrim(coalesce(p_note,'')), auth.uid(), coalesce(v_profile.name,''));
  return jsonb_build_object('ok', true, 'outstandingBalance', v_customer.outstanding_balance);
end; $$;
revoke execute on function public.record_customer_transaction(uuid, uuid, text, numeric, text, date) from public;
grant execute on function public.record_customer_transaction(uuid, uuid, text, numeric, text, date) to authenticated;

/* ------------------------------------------------------------------ */
/* 6. Trigger: a phone match in close_shift / resubmit must never       */
/*    attach a new sale to archived history                             */
/* ------------------------------------------------------------------ */

create or replace function public.reject_archived_customer_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.credit_customers where id = new.customer_id and archived_at is not null) then
    raise exception 'This phone belongs to an archived customer. Restore it before recording credit.' using errcode = '55000';
  end if;
  return new;
end; $$;
drop trigger if exists customer_transactions_archived_guard on public.customer_transactions;
create trigger customer_transactions_archived_guard before insert on public.customer_transactions
  for each row execute function public.reject_archived_customer_transaction();
revoke execute on function public.reject_archived_customer_transaction() from public;

/* ------------------------------------------------------------------ */
/* 7. Reload PostgREST's schema cache so the new column is visible to   */
/*    the API immediately, and show the repaired state.                 */
/* ------------------------------------------------------------------ */

notify pgrst, 'reload schema';

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credit_customers'
      and column_name = 'archived_at'
  ) as archived_at_present,
  to_regclass('public.customer_audit') is not null as audit_table_present,
  to_regprocedure('public.archive_customer(uuid)') is not null as archive_rpc_present;
