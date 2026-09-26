-- A closed shift is not always right. A reviewer can send a pending shift
-- back for its operator to fix, but once a shift was approved it was locked
-- forever, and even a sent-back shift could only be corrected by the
-- attendant who ran it.
--
-- This gives the actual station owner a deliberate escape hatch: reopen any
-- CLOSED shift — pending review, sent back, or already approved — into the
-- `rejected` correction state, where the full-shift correction flow takes
-- over. Reopening is a correction, not a re-run: the shift keeps its close
-- time and audit trail, its nozzle rows stay historical, no nozzle is ever
-- claimed again, and the reopen is recorded against the owner with a reason.
create or replace function public.reopen_shift_for_correction(
  p_station_id uuid,
  p_shift_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_owner public.profiles;
begin
  perform public.assert_station_access(p_station_id);

  -- Deliberately narrower than review_shift: only the actual owner of the
  -- station may unlock a closed record. Managers send shifts back for their
  -- operators to correct; they do not rewrite history themselves.
  if public.current_account_role() <> 'owner'::public.account_role
     or not exists (
       select 1 from public.stations s
       where s.id = p_station_id and s.owner_id = auth.uid()
     ) then
    raise exception 'Only the station owner can reopen a shift for correction.'
      using errcode = '42501';
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id and station_id = p_station_id
  for update;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;

  -- Reopening is for closed records only. An open shift is still running;
  -- its figures are not settled and it is closed, not reopened, when done.
  if v_shift.status = 'open'::public.shift_status then
    raise exception 'This shift is still open — close it before correcting it.'
      using errcode = '55000';
  end if;

  select * into v_owner from public.profiles where id = auth.uid();

  -- Reuse the sent-back audit columns: the correction screens, the
  -- attendant resubmission RPC, and the review flow all already speak
  -- `rejected` plus a reason. The approval trail is kept, not erased —
  -- reopening records who asked for the correction and why.
  update public.shifts
  set
    status = 'rejected'::public.shift_status,
    rejected_by = auth.uid(),
    rejected_by_name = coalesce(v_owner.name, ''),
    rejected_at = now(),
    rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'Reopened for correction')
  where id = p_shift_id;

  return jsonb_build_object('ok', true, 'shiftId', p_shift_id, 'status', 'rejected');
end;
$$;

comment on function public.reopen_shift_for_correction(uuid, uuid, text) is
  'Lets the station owner reopen any closed shift — approved included — into the rejected correction state, without reclaiming nozzles.';

revoke execute on function public.reopen_shift_for_correction(uuid, uuid, text) from public;
grant execute on function public.reopen_shift_for_correction(uuid, uuid, text) to authenticated;
