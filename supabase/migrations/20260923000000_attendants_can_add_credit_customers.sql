-- Credit customer accounts are shared station records. Every station member,
-- including attendants, must be able to add an account; only the financial
-- ledger (balances and transactions) remains manager/owner-only.
--
-- The SECURITY DEFINER RPC is the single write path, so the existing RLS and
-- attendant trigger still prevent direct table writes.

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
  values (p_station_id, btrim(p_name), btrim(coalesce(p_phone, '')))
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

comment on function public.create_customer(uuid, text, text) is
  'Adds a station credit customer. All station members may create accounts; financial ledger actions remain manager/owner-only.';

revoke execute on function public.create_customer(uuid, text, text) from public;
grant execute on function public.create_customer(uuid, text, text) to authenticated;
