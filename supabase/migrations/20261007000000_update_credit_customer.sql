-- Edit a credit customer's name and phone after the account exists.
--
-- Until now a typo in a name, or a phone number learned later, meant adding a
-- second customer. The SECURITY DEFINER RPC is the single write path, mirroring
-- create_customer: trimmed values, the same name validation, and manager-only
-- through assert_manager_station, since edits happen from the ledger-side
-- customer screen. A no-op save writes nothing and leaves no audit row.

-- The customer audit trail learns to record what changed, not only that an
-- account was archived or restored. The DO block makes this re-runnable in
-- the dashboard SQL editor: applying it twice is a harmless no-op.
alter table public.customer_audit drop constraint if exists customer_audit_action_check;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_audit_action_check'
      and conrelid = 'public.customer_audit'::regclass
  ) then
    alter table public.customer_audit
      add constraint customer_audit_action_check
      check (action in ('archived', 'restored', 'updated'));
  end if;
end;
$$;
alter table public.customer_audit add column if not exists details jsonb;

create or replace function public.update_customer(
  p_customer_id uuid,
  p_name text,
  p_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.credit_customers;
  v_name text;
  v_phone text;
begin
  select * into v_customer from public.credit_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;
  perform public.assert_manager_station(v_customer.station_id);

  v_name := btrim(p_name);
  v_phone := btrim(coalesce(p_phone, ''));
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;

  if v_customer.name is distinct from v_name or v_customer.phone is distinct from v_phone then
    insert into public.customer_audit (station_id, customer_id, action, acted_by, details)
    values (
      v_customer.station_id,
      p_customer_id,
      'updated',
      auth.uid(),
      jsonb_build_object(
        'from', jsonb_build_object('name', v_customer.name, 'phone', v_customer.phone),
        'to', jsonb_build_object('name', v_name, 'phone', v_phone)
      )
    );
    update public.credit_customers
    set name = v_name, phone = v_phone
    where id = p_customer_id
    returning * into v_customer;
  end if;

  return to_jsonb(v_customer);
end;
$$;

comment on function public.update_customer(uuid, text, text) is
  'Corrects a credit customer''s name or phone. Owner/manager only; the balance and ledger history are untouched, and the change is written to customer_audit.';

-- New functions default to EXECUTE for PUBLIC. Take that back first, then
-- hand it to authenticated only — the function body re-checks the caller is
-- an owner or manager of the customer's station.
revoke execute on function public.update_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_customer(uuid, text, text) to authenticated;
