-- A shift starts on the nozzles its operator takes at the start, but the
-- forecourt does not always work out that way. A second pump is pressed into
-- service when the queue builds, a nozzle was forgotten when the shift was
-- opened, or one was taken by mistake and never fuelled from. Until now the
-- only way to change a shift's nozzles was to close it and open another,
-- which split one operator's day across two records and left the meters
-- between them unaccounted for.
--
-- This migration adds the two deliberate doors onto an OPEN shift:
--
--   add_shift_nozzles    claims extra free nozzles for the shift. Each one
--                        starts from the reading on its meter right now and
--                        at the rate in force right now — the same snapshot
--                        rule open_shift applies, taken at the moment the
--                        nozzle really starts rather than when the shift did.
--   remove_shift_nozzle  releases a nozzle taken by mistake. The claim row is
--                        deleted and the nozzle's meter is left exactly where
--                        it was, so nothing is re-attributed: only a nozzle
--                        the operator has NOT drawn through is safe to
--                        release. Anything already fuelled belongs in the
--                        close, where its litres are counted and reconciled.
--                        The last nozzle cannot go: a shift with no nozzles is
--                        a record of nothing, and is closed rather than
--                        emptied.
--
-- Both doors are shut once the shift is closed, and both are open to the
-- shift's own operator and to an owner or manager of that station — a
-- manager is the one standing at the pump when it has to be done.

/* ------------------------------------------------------------------ */
/* The one guard both doors share                                      */
/* ------------------------------------------------------------------ */

-- Locks the shift and answers who may change its nozzle list, so the rule
-- lives in exactly one place. Locking the shift row first — the order
-- close_shift uses — means a nozzle cannot be claimed for a shift that is
-- being closed in the same instant.
create or replace function public.lock_editable_shift(p_station_id uuid, p_shift_id uuid)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_role public.account_role;
begin
  perform public.assert_station_access(p_station_id);

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

  v_role := public.current_account_role();
  if v_role = 'attendant'::public.account_role then
    if v_shift.employee_id is distinct from auth.uid() then
      raise exception 'You can only work on your own shift.' using errcode = '42501';
    end if;
  elsif v_role is null
        or v_role not in ('owner'::public.account_role, 'manager'::public.account_role)
        or not public.can_manage_station(p_station_id) then
    raise exception 'Only the shift''s operator, or an owner or manager of the station, can change its nozzles.'
      using errcode = '42501';
  end if;

  return v_shift;
end;
$$;

comment on function public.lock_editable_shift(uuid, uuid) is
  'Locks an open shift and asserts the caller may change its nozzle list: the shift''s own operator, or an owner/manager of that station.';

/* ------------------------------------------------------------------ */
/* Taking a free nozzle onto a running shift                           */
/* ------------------------------------------------------------------ */

create or replace function public.add_shift_nozzles(
  p_station_id uuid,
  p_shift_id uuid,
  p_nozzle_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nozzle_id uuid;
  v_nozzle record;
  v_price public.fuel_prices;
  v_label text;
  v_added jsonb := '[]'::jsonb;
begin
  -- Nothing is read from the shift here: the call is the lock and the
  -- authority check, in the one place both share.
  perform public.lock_editable_shift(p_station_id, p_shift_id);

  if coalesce(cardinality(p_nozzle_ids), 0) = 0 then
    raise exception 'Select at least one nozzle.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_nozzle_ids) as x) <> cardinality(p_nozzle_ids) then
    raise exception 'Select each nozzle only once.' using errcode = '22023';
  end if;

  foreach v_nozzle_id in array p_nozzle_ids loop
    -- Lock the nozzle and its pump, exactly as open_shift does, so a
    -- retirement cannot slip between the availability check and the claim.
    select n.*, p.name as pump_name, p.state as pump_state
    into v_nozzle
    from public.nozzles n
    join public.pumps p on p.id = n.pump_id
    where n.id = v_nozzle_id and n.station_id = p_station_id
    for update of n, p;

    if not found then
      raise exception 'Nozzle not found.' using errcode = 'P0002';
    end if;
    if v_nozzle.pump_state <> 'active'::public.asset_state
       or v_nozzle.state <> 'active'::public.asset_state then
      raise exception 'That nozzle is out of service.' using errcode = '55000';
    end if;

    -- Already on this shift, or on someone else's: the partial unique index
    -- refuses both, and this check turns that refusal into a sentence.
    if exists (
      select 1
      from public.shift_nozzles
      where station_id = p_station_id and nozzle_id = v_nozzle_id and is_open
    ) then
      raise exception 'Nozzle % is already in an open shift.', v_nozzle.name
        using errcode = '55000';
    end if;

    select * into v_price
    from public.fuel_prices
    where station_id = p_station_id and fuel_type = v_nozzle.fuel_type and effective_to is null;
    if not found then
      raise exception 'Set a price for % before adding this nozzle.', v_nozzle.fuel_type
        using errcode = '55000';
    end if;

    v_label := coalesce(v_nozzle.pump_name, 'Pump') || ' · ' || v_nozzle.name;
    insert into public.shift_nozzles (
      shift_id, station_id, nozzle_id, pump_id, label, fuel_type, opening_reading, price, price_id
    ) values (
      p_shift_id, p_station_id, v_nozzle.id, v_nozzle.pump_id,
      v_label, v_nozzle.fuel_type, v_nozzle.last_reading, v_price.price, v_price.id
    );
    v_added := v_added || jsonb_build_array(
      jsonb_build_object(
        'nozzleId', v_nozzle.id,
        'label', v_label,
        'fuelType', v_nozzle.fuel_type,
        'openingReading', v_nozzle.last_reading,
        'price', v_price.price
      )
    );
  end loop;

  return jsonb_build_object('ok', true, 'shiftId', p_shift_id, 'added', v_added);
end;
$$;

comment on function public.add_shift_nozzles(uuid, uuid, uuid[]) is
  'Claims extra free nozzles for a running shift, each from the reading on its meter now and at the rate in force now.';

/* ------------------------------------------------------------------ */
/* Releasing a nozzle taken by mistake                                 */
/* ------------------------------------------------------------------ */

create or replace function public.remove_shift_nozzle(
  p_station_id uuid,
  p_shift_id uuid,
  p_nozzle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.shift_nozzles;
begin
  -- The shared guard locks the shift and answers who may touch its nozzles.
  perform public.lock_editable_shift(p_station_id, p_shift_id);

  select * into v_claim
  from public.shift_nozzles
  where shift_id = p_shift_id and nozzle_id = p_nozzle_id and is_open
  for update;
  if not found then
    raise exception 'That nozzle is not on this shift.' using errcode = 'P0002';
  end if;

  -- A shift exists because someone took at least one nozzle. Giving the last
  -- one back would leave a running record of nothing, so the answer is to
  -- close this shift and open the one that is actually being worked.
  if not exists (
    select 1 from public.shift_nozzles
    where shift_id = p_shift_id and is_open and id <> v_claim.id
  ) then
    raise exception 'A shift needs at least one nozzle — close it instead.'
      using errcode = '55000';
  end if;

  -- The claim goes; the meter stays where this shift opened it. A nozzle
  -- that was fuelled from is therefore NOT released here — its litres must
  -- be counted at the close, or they would land on whoever takes the nozzle
  -- next.
  delete from public.shift_nozzles where id = v_claim.id;

  return jsonb_build_object('ok', true, 'shiftId', p_shift_id, 'removed', p_nozzle_id);
end;
$$;

comment on function public.remove_shift_nozzle(uuid, uuid, uuid) is
  'Releases a nozzle taken by mistake from a running shift. The meter is left untouched, so only a nozzle with nothing drawn through it should be released.';

/* ------------------------------------------------------------------ */
/* Browser-facing surface                                              */
/* ------------------------------------------------------------------ */

-- Functions created after the initial migration do not inherit its blanket
-- revoke, so each one states its own surface: the guard is internal, the two
-- doors are for signed-in station members and re-check authority themselves.
revoke execute on function public.lock_editable_shift(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.add_shift_nozzles(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.add_shift_nozzles(uuid, uuid, uuid[]) to authenticated;
revoke execute on function public.remove_shift_nozzle(uuid, uuid, uuid) from public, anon;
grant execute on function public.remove_shift_nozzle(uuid, uuid, uuid) to authenticated;
