-- ---------------------------------------------------------------------------
-- HOTFIX: bring a live Supabase project up to date with the stock-movement
-- ledger when `supabase db push` was not run after the meter/stock update.
--
-- Symptom this fixes:
--   Ground Stock screen shows
--   "Could not find the table 'public.stock_movements' in the schema cache."
--
-- This is an idempotent re-statement of the two pending migrations:
--   supabase/migrations/20260920000000_meter_stock_reconciliation.sql
--   supabase/migrations/20260920120000_admin_registry_and_manager_staff.sql
-- Safe to run more than once. Paste into Supabase Dashboard -> SQL Editor and
-- run as one script.
--
-- Preferred alternative (keeps migration history in sync):
--   supabase link --project-ref YOUR_PROJECT_REF
--   supabase db push
-- If you run THIS script instead of db push, reconcile history afterwards:
--   supabase migration repair --status applied 20260920000000
--   supabase migration repair --status applied 20260920120000
-- ---------------------------------------------------------------------------

/* ------------------------------------------------------------------ */
/* 1. Nozzle -> tank mapping                                            */
/* ------------------------------------------------------------------ */

alter table public.nozzles add column if not exists tank_id uuid references public.tanks(id) on delete restrict;
create index if not exists nozzles_tank_idx on public.nozzles(tank_id);

/* ------------------------------------------------------------------ */
/* 2. The immutable stock-movement ledger                               */
/* ------------------------------------------------------------------ */

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  tank_id uuid not null references public.tanks(id) on delete restrict,
  fuel_type text not null,
  movement_type text not null check (movement_type in ('opening','delivery','sale','dip_adjustment','manual_adjustment','correction')),
  quantity_litres numeric(14,2) not null,
  reference_type text not null,
  reference_id uuid,
  reference_line_id uuid,
  before_stock numeric(14,2) not null check (before_stock >= 0),
  after_stock numeric(14,2) not null check (after_stock >= 0),
  recorded_by uuid references public.profiles(id),
  recorded_by_name text not null default '',
  recorded_at timestamptz not null default now(),
  note text not null default '',
  check (movement_type in ('sale') or quantity_litres >= 0)
);
create index if not exists stock_movements_tank_time_idx on public.stock_movements(tank_id, recorded_at desc);
create index if not exists stock_movements_station_time_idx on public.stock_movements(station_id, recorded_at desc);
create unique index if not exists stock_movements_reference_line_uidx
  on public.stock_movements(reference_type, reference_id, reference_line_id)
  where reference_id is not null and reference_line_id is not null;

alter table public.tank_readings add column if not exists request_id uuid;
create unique index if not exists tank_readings_request_uidx on public.tank_readings(recorded_by, request_id)
  where request_id is not null;

-- Station users, including attendants, can inspect tanks and immutable readings.
drop policy if exists tanks_read on public.tanks;
create policy tanks_read on public.tanks for select to authenticated using (public.can_access_station(station_id));
drop policy if exists tank_readings_read on public.tank_readings;
create policy tank_readings_read on public.tank_readings for select to authenticated using (public.can_access_station(station_id));

alter table public.stock_movements enable row level security;
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (public.can_access_station(station_id));
grant select on public.stock_movements to authenticated;

-- Existing tank stock is the opening book balance for the immutable ledger.
insert into public.stock_movements(station_id,tank_id,fuel_type,movement_type,quantity_litres,
  reference_type,reference_id,before_stock,after_stock,note)
select station_id,id,fuel_type,'opening',current_stock,'tank',id,0,current_stock,'Opening balance at stock-ledger migration'
from public.tanks
where not exists (select 1 from public.stock_movements m where m.tank_id=tanks.id and m.movement_type='opening');

/* ------------------------------------------------------------------ */
/* 3. RPCs                                                              */
/* ------------------------------------------------------------------ */

create or replace function public.map_nozzle_tank(p_station_id uuid,p_nozzle_id uuid,p_tank_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_n public.nozzles; v_t public.tanks;
begin
  perform public.assert_manager_station(p_station_id);
  select * into v_n from public.nozzles where id=p_nozzle_id and station_id=p_station_id for update;
  select * into v_t from public.tanks where id=p_tank_id and station_id=p_station_id and state='active';
  if v_n.id is null or v_t.id is null then raise exception 'Nozzle or tank not found.' using errcode='P0002'; end if;
  if lower(v_n.fuel_type) <> lower(v_t.fuel_type) then raise exception 'Nozzle and tank fuel types must match.' using errcode='22023'; end if;
  update public.nozzles set tank_id=p_tank_id where id=p_nozzle_id;
  return jsonb_build_object('ok',true);
end $$;

-- Dips are immutable observations. Attendants may record one only at their station.
drop function if exists public.record_dip(uuid,uuid,numeric,numeric,numeric,text);
drop function if exists public.record_dip(uuid,uuid,numeric,numeric,numeric,text,uuid);
create function public.record_dip(
  p_station_id uuid,p_tank_id uuid,p_stock_litres numeric,p_temperature_c numeric,
  p_water_cm numeric default null,p_note text default '',p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_t public.tanks; v_p public.profiles; v_now timestamptz:=now(); v_id uuid;
begin
  perform public.assert_station_access(p_station_id);
  select * into v_p from public.profiles where id=auth.uid();
  if v_p.role not in ('owner','manager','attendant') then raise exception 'Not allowed to record ground stock.' using errcode='42501'; end if;
  if p_stock_litres is null or p_stock_litres<0 then raise exception 'Stock cannot be negative.' using errcode='22023'; end if;
  if p_temperature_c is null or p_temperature_c<5 or p_temperature_c>55 then raise exception 'Temperature must be between 5 and 55 C.' using errcode='22023'; end if;
  if p_water_cm is not null and p_water_cm<0 then raise exception 'Water level cannot be negative.' using errcode='22023'; end if;
  select * into v_t from public.tanks where id=p_tank_id and station_id=p_station_id for update;
  if not found then raise exception 'This tank belongs to another station or does not exist.' using errcode='P0002'; end if;
  if v_t.state='retired' then raise exception 'This tank is out of service.' using errcode='55000'; end if;
  if p_stock_litres>v_t.capacity then raise exception 'The entered quantity exceeds tank capacity.' using errcode='22023'; end if;
  if p_request_id is not null then
    select id into v_id from public.tank_readings where recorded_by=auth.uid() and request_id=p_request_id;
    if v_id is not null then return jsonb_build_object('ok',true,'readingId',v_id,'duplicate',true); end if;
  end if;
  insert into public.tank_readings(station_id,tank_id,kind,stock_litres,previous_stock,change,
    temperature_c,water_cm,note,recorded_by,recorded_by_name,recorded_at,request_id)
  values(p_station_id,p_tank_id,'dip',p_stock_litres,v_t.current_stock,
    round(p_stock_litres-v_t.current_stock,2),p_temperature_c,p_water_cm,btrim(coalesce(p_note,'')),
    auth.uid(),coalesce(v_p.name,''),v_now,p_request_id) returning id into v_id;
  update public.tanks set temperature_c=p_temperature_c,water_cm=p_water_cm,last_dip_at=v_now,last_dip_by=coalesce(v_p.name,'') where id=p_tank_id;
  return jsonb_build_object('ok',true,'readingId',v_id,'bookStock',v_t.current_stock,
    'physicalStock',p_stock_litres,'variance',round(p_stock_litres-v_t.current_stock,2));
end $$;

create or replace function public.record_delivery(p_station_id uuid,p_tank_id uuid,p_litres numeric,p_temperature_c numeric,p_invoice text default '',p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_t public.tanks; v_p public.profiles; v_after numeric; v_id uuid; v_now timestamptz:=now();
begin
  perform public.assert_manager_station(p_station_id);
  if p_litres is null or p_litres<=0 or p_temperature_c is null or p_temperature_c<5 or p_temperature_c>55 then raise exception 'Enter a plausible delivery quantity and temperature.' using errcode='22023'; end if;
  select * into v_t from public.tanks where id=p_tank_id and station_id=p_station_id for update;
  if not found then raise exception 'Tank not found.' using errcode='P0002'; end if;
  v_after:=v_t.current_stock+p_litres;
  if v_after>v_t.capacity then raise exception 'Delivery exceeds remaining tank capacity.' using errcode='22023'; end if;
  select * into v_p from public.profiles where id=auth.uid();
  insert into public.tank_readings(station_id,tank_id,kind,stock_litres,previous_stock,change,temperature_c,water_cm,invoice,note,recorded_by,recorded_by_name,recorded_at)
  values(p_station_id,p_tank_id,'delivery',v_after,v_t.current_stock,p_litres,p_temperature_c,v_t.water_cm,btrim(coalesce(p_invoice,'')),btrim(coalesce(p_note,'')),auth.uid(),coalesce(v_p.name,''),v_now) returning id into v_id;
  insert into public.stock_movements(station_id,tank_id,fuel_type,movement_type,quantity_litres,reference_type,reference_id,before_stock,after_stock,recorded_by,recorded_by_name,recorded_at,note)
  values(p_station_id,p_tank_id,v_t.fuel_type,'delivery',p_litres,'delivery',v_id,v_t.current_stock,v_after,auth.uid(),coalesce(v_p.name,''),v_now,btrim(coalesce(p_note,'')));
  update public.tanks set current_stock=v_after,temperature_c=p_temperature_c where id=p_tank_id;
  return jsonb_build_object('ok',true,'bookStock',v_after);
end $$;

-- Replaces shift close: meter volumes are posted atomically to explicitly mapped tanks.
create or replace function public.close_shift(p_station_id uuid,p_shift_id uuid,p_closing_readings jsonb,p_payments jsonb default '{}'::jsonb,p_testing jsonb default '{}'::jsonb,p_note text default '',p_credit_sales jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_s public.shifts; v_n record; v_c numeric; v_l numeric; v_t public.tanks; v_p public.profiles;
  v_sale jsonb; v_customer_id uuid; v_customer public.credit_customers; v_amount numeric; v_name text; v_phone text; v_credit_rows jsonb:='[]';
begin
  perform public.assert_station_access(p_station_id);
  select * into v_p from public.profiles where id=auth.uid();
  select * into v_s from public.shifts where id=p_shift_id and station_id=p_station_id for update;
  if not found then raise exception 'Shift not found.' using errcode='P0002'; end if;
  if v_s.status<>'open' then raise exception 'That shift is already closed.' using errcode='55000'; end if;
  for v_n in select sn.*,n.tank_id from public.shift_nozzles sn join public.nozzles n on n.id=sn.nozzle_id where sn.shift_id=p_shift_id order by sn.id for update of sn,n loop
    begin v_c:=nullif(btrim(coalesce(p_closing_readings->>v_n.nozzle_id::text,'')),'')::numeric; exception when invalid_text_representation then raise exception 'Closing reading is invalid for %.',v_n.label using errcode='22023'; end;
    if v_c is null or v_c<0 then raise exception 'Closing reading missing for %.',v_n.label using errcode='22023'; end if;
    if v_n.tank_id is null then raise exception 'Map % to a tank before closing this shift.',v_n.label using errcode='55000'; end if;
    v_l:=round(case when v_c>=v_n.opening_reading then v_c-v_n.opening_reading else 1000000-v_n.opening_reading+v_c end,2);
    select * into v_t from public.tanks where id=v_n.tank_id and station_id=p_station_id for update;
    if v_t.id is null then raise exception 'Mapped tank not found for %.',v_n.label using errcode='P0002'; end if;
    if v_t.current_stock<v_l then raise exception 'Tank stock would become negative. Verify the meter reading or tank configuration.' using errcode='23514'; end if;
    insert into public.stock_movements(station_id,tank_id,fuel_type,movement_type,quantity_litres,reference_type,reference_id,reference_line_id,before_stock,after_stock,recorded_by,recorded_by_name,note)
    values(p_station_id,v_t.id,v_t.fuel_type,'sale',-v_l,'shift',p_shift_id,v_n.id,v_t.current_stock,v_t.current_stock-v_l,auth.uid(),coalesce(v_p.name,''),v_n.label);
    update public.tanks set current_stock=current_stock-v_l where id=v_t.id;
    update public.nozzles set last_reading=v_c where id=v_n.nozzle_id;
    update public.shift_nozzles set closing_reading=v_c,is_open=false where id=v_n.id;
  end loop;
  for v_sale in select value from jsonb_array_elements(coalesce(p_credit_sales,'[]')) loop
    begin v_amount:=coalesce(nullif(btrim(coalesce(v_sale->>'amount','')),'')::numeric,0); exception when invalid_text_representation then raise exception 'Credit sale amount is invalid.' using errcode='22023'; end;
    if v_amount<=0 then raise exception 'Credit sale amount must be greater than zero.' using errcode='22023'; end if;
    v_name:=btrim(coalesce(v_sale->>'name','')); v_phone:=btrim(coalesce(v_sale->>'phone',''));
    if nullif(v_sale->>'customerId','') is not null then v_customer_id:=(v_sale->>'customerId')::uuid; select * into v_customer from public.credit_customers where id=v_customer_id and station_id=p_station_id for update; if not found then raise exception 'Customer not found.' using errcode='P0002'; end if;
    elsif v_phone<>'' then select * into v_customer from public.credit_customers where station_id=p_station_id and phone=v_phone order by created_at limit 1 for update; if found then v_customer_id:=v_customer.id; else insert into public.credit_customers(station_id,name,phone,created_from_shift) values(p_station_id,coalesce(nullif(v_name,''),'Walk-in'),v_phone,p_shift_id) returning id into v_customer_id; end if;
    else insert into public.credit_customers(station_id,name,phone,created_from_shift) values(p_station_id,coalesce(nullif(v_name,''),'Walk-in'),'',p_shift_id) returning id into v_customer_id; end if;
    update public.credit_customers set outstanding_balance=outstanding_balance+v_amount where id=v_customer_id returning * into v_customer;
    insert into public.customer_transactions(station_id,customer_id,shift_id,type,amount,note,recorded_by,recorded_by_name) values(p_station_id,v_customer_id,p_shift_id,'credit',v_amount,v_s.employee_name||' shift',auth.uid(),coalesce(v_p.name,''));
    v_credit_rows:=v_credit_rows||jsonb_build_array(jsonb_build_object('customerId',v_customer_id,'name',v_customer.name,'phone',v_customer.phone,'amount',v_amount));
  end loop;
  update public.shifts set payments=jsonb_build_object('cash',public.json_amount(p_payments,'cash'),'card',public.json_amount(p_payments,'card'),'upi',public.json_amount(p_payments,'upi'),'credit',public.json_amount(p_payments,'credit'),'other',public.json_amount(p_payments,'other')),testing=jsonb_build_object('MS',public.json_amount(p_testing,'MS'),'HSD',public.json_amount(p_testing,'HSD')),credit_sales=v_credit_rows,note=btrim(coalesce(p_note,'')),status='pending_review',end_time=now(),closed_by_name=coalesce(v_p.name,'') where id=p_shift_id;
  return jsonb_build_object('ok',true,'shiftId',p_shift_id);
end $$;

create or replace function public.daily_stock_summary(p_station_id uuid,p_date date default current_date)
returns table(tank_id uuid,tank_name text,fuel_type text,opening_stock numeric,deliveries numeric,meter_sales numeric,adjustments numeric,book_closing numeric,physical_closing numeric,variance numeric)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.assert_station_access(p_station_id);
  return query
  with m as (select sm.tank_id,
    coalesce(sum(case when sm.movement_type='delivery' then sm.quantity_litres else 0 end),0) delivered,
    coalesce(sum(case when sm.movement_type='sale' then -sm.quantity_litres else 0 end),0) sold,
    coalesce(sum(case when sm.movement_type in ('manual_adjustment','correction','dip_adjustment') then sm.quantity_litres else 0 end),0) adjusted
    from public.stock_movements sm where sm.station_id=p_station_id and sm.recorded_at>=p_date::timestamptz and sm.recorded_at<(p_date+1)::timestamptz group by sm.tank_id),
  d as (select distinct on(tr.tank_id) tr.tank_id,tr.stock_litres from public.tank_readings tr where tr.station_id=p_station_id and tr.kind='dip' and tr.recorded_at<(p_date+1)::timestamptz order by tr.tank_id,tr.recorded_at desc),
  close as (select distinct on(sm.tank_id) sm.tank_id,sm.after_stock from public.stock_movements sm where sm.station_id=p_station_id and sm.recorded_at<(p_date+1)::timestamptz order by sm.tank_id,sm.recorded_at desc,sm.id desc)
  select t.id,t.name,t.fuel_type,round(coalesce(c.after_stock,t.current_stock)-coalesce(m.delivered,0)+coalesce(m.sold,0)-coalesce(m.adjusted,0),2),coalesce(m.delivered,0),coalesce(m.sold,0),coalesce(m.adjusted,0),coalesce(c.after_stock,t.current_stock),d.stock_litres,case when d.stock_litres is null then null else round(d.stock_litres-coalesce(c.after_stock,t.current_stock),2) end
  from public.tanks t left join m on m.tank_id=t.id left join d on d.tank_id=t.id left join close c on c.tank_id=t.id where t.station_id=p_station_id order by t.created_at;
end $$;

revoke execute on function public.map_nozzle_tank(uuid,uuid,uuid),public.record_dip(uuid,uuid,numeric,numeric,numeric,text,uuid),public.daily_stock_summary(uuid,date) from public;
grant execute on function public.map_nozzle_tank(uuid,uuid,uuid),public.record_dip(uuid,uuid,numeric,numeric,numeric,text,uuid),public.daily_stock_summary(uuid,date) to authenticated;

/* ------------------------------------------------------------------ */
/* 4. Admin registry and manager staff visibility (second pending       */
/*    migration, included so one paste catches the project up fully)    */
/* ------------------------------------------------------------------ */

create or replace function public.manager_station_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role = 'manager'::public.account_role then p.station_id
  end
  from public.profiles p
  where p.id = auth.uid()
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or (
    owner_id = auth.uid()
    and role in ('manager'::public.account_role, 'attendant'::public.account_role)
  )
  or (
    role in ('manager'::public.account_role, 'attendant'::public.account_role)
    and station_id is not null
    and station_id = public.manager_station_id()
  )
);

create or replace function public.admin_station_registry()
returns table (
  station_id uuid,
  name text,
  address text,
  state public.station_state,
  owner_id uuid,
  owner_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Developer access is required.' using errcode = '42501';
  end if;
  return query
    select s.id, s.name, s.address, s.state, s.owner_id, p.name
    from public.stations s
    join public.profiles p on p.id = s.owner_id
    order by s.name;
end;
$$;

revoke execute on function
  public.admin_station_registry(),
  public.manager_station_id()
from public, anon, authenticated;

grant execute on function
  public.admin_station_registry(),
  public.manager_station_id()
to authenticated;

/* ------------------------------------------------------------------ */
/* 5. Refresh PostgREST's schema cache so the API sees the new table    */
/*    immediately instead of after the next cache cycle.                */
/* ------------------------------------------------------------------ */

notify pgrst, 'reload schema';
