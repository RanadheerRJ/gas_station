-- Station Ledger: developer-console station and account administration.
--
-- Until now the developer console could only *create* an owner (with their
-- first station) and purge a station's operational data. Everything else —
-- correcting a mistyped station name, moving a station to the right owner,
-- archiving one, or removing a station that was created by mistake — needed
-- someone with SQL access. This migration closes that gap by giving the
-- console a complete, admin-only CRUD surface over the station registry and
-- the profile rows it provisions.
--
-- The security posture is unchanged and deliberately narrow:
--
--   * Every function below is admin-only and SECURITY DEFINER. A developer
--     still reads no shift, price, tank, or credit row: `select * from
--     stations` returns nothing to them, and none of these functions returns
--     operational data.
--   * Station *registry* metadata (id, name, address, state, owner, how many
--     logins are posted there) is account-provisioning data, which is the
--     one carve-out the role matrix already makes for admin_station_registry.
--   * Deleting a station is the one genuinely destructive action, so it
--     reuses exactly the purge order reset_station_data uses, then removes
--     the logins posted to that station and the station row itself. It
--     returns the auth user ids it orphaned so the `accounts` Edge Function
--     can delete the matching Auth users with the service key — the browser
--     never gets that power.

/* ------------------------------------------------------------------ */
/* 1. Registry: add the two columns the console's list needs           */
/* ------------------------------------------------------------------ */

-- The return type gains columns, which `create or replace` cannot do.
drop function if exists public.admin_station_registry();

create or replace function public.admin_station_registry()
returns table (
  station_id uuid,
  name text,
  address text,
  state public.station_state,
  owner_id uuid,
  owner_name text,
  owner_username text,
  staff_count integer,
  created_at timestamptz
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
    select
      s.id,
      s.name,
      s.address,
      s.state,
      s.owner_id,
      p.name,
      p.username,
      (
        select count(*)::int
        from public.profiles staff
        where staff.station_id = s.id
          and staff.role in ('manager'::public.account_role, 'attendant'::public.account_role)
      ),
      s.created_at
    from public.stations s
    join public.profiles p on p.id = s.owner_id
    order by s.name;
end;
$$;

comment on function public.admin_station_registry() is
  'Station registry for account provisioning support: id, name, address, state, owner, login count, and creation date. Admin-only; deliberately exposes no operational, financial, or stock data.';

/* ------------------------------------------------------------------ */
/* 2. Create                                                           */
/* ------------------------------------------------------------------ */

-- add_station() creates a station for the *calling* owner. A developer owns
-- nothing, so provisioning a second station for an existing owner needed a
-- separate entry point that names the owner explicitly.
create or replace function public.admin_create_station(
  p_owner_id uuid,
  p_name text,
  p_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.stations;
begin
  if not public.is_admin() then
    raise exception 'Developer access is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_owner_id and role = 'owner'::public.account_role
  ) then
    raise exception 'Pick an owner for this station.' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_address, ''))) not between 1 and 300 then
    raise exception 'Station name and address are required.' using errcode = '22023';
  end if;

  insert into public.stations (name, address, owner_id)
  values (btrim(p_name), btrim(p_address), p_owner_id)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

comment on function public.admin_create_station(uuid, text, text) is
  'Creates a station for a named owner. Admin-only; the owner-facing add_station() still only creates stations for the caller.';

/* ------------------------------------------------------------------ */
/* 3. Update                                                           */
/* ------------------------------------------------------------------ */

-- Name, address, and — when a station was filed under the wrong account —
-- the owner it belongs to. Transferring a station moves the logins posted to
-- it as well, otherwise a manager would keep an owner_id pointing at someone
-- who can no longer see their station.
create or replace function public.admin_update_station(
  p_station_id uuid,
  p_name text,
  p_address text,
  p_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stations;
  v_owner uuid;
begin
  if not public.is_admin() then
    raise exception 'Developer access is required.' using errcode = '42501';
  end if;
  select * into v_row from public.stations where id = p_station_id for update;
  if not found then
    raise exception 'Station not found.' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_address, ''))) not between 1 and 300 then
    raise exception 'Station name and address are required.' using errcode = '22023';
  end if;

  v_owner := coalesce(p_owner_id, v_row.owner_id);
  if not exists (
    select 1 from public.profiles
    where id = v_owner and role = 'owner'::public.account_role
  ) then
    raise exception 'Pick an owner for this station.' using errcode = 'P0002';
  end if;

  update public.stations
  set name = btrim(p_name), address = btrim(p_address), owner_id = v_owner
  where id = p_station_id
  returning * into v_row;

  -- Keep the station's logins under whoever now owns it.
  update public.profiles
  set owner_id = v_owner, updated_at = now()
  where station_id = p_station_id
    and role in ('manager'::public.account_role, 'attendant'::public.account_role)
    and owner_id is distinct from v_owner;

  return to_jsonb(v_row);
end;
$$;

comment on function public.admin_update_station(uuid, text, text, uuid) is
  'Renames, re-addresses, or re-owns a station. Admin-only; transferring a station moves the manager and attendant logins posted to it with it.';

-- set_station_state() is the owner's; this is the same transition for a
-- developer supporting an account they do not own. The archive guards are
-- kept identical on purpose — archiving a station with a shift still running
-- would strand that shift whoever asks for it.
create or replace function public.admin_set_station_state(
  p_station_id uuid,
  p_state public.station_state
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Developer access is required.' using errcode = '42501';
  end if;
  perform 1 from public.stations where id = p_station_id for update;
  if not found then
    raise exception 'Station not found.' using errcode = 'P0002';
  end if;
  if p_state = 'archived'::public.station_state
     and exists (
       select 1 from public.shifts
       where station_id = p_station_id and status = 'open'::public.shift_status
     ) then
    raise exception 'Close the open shift before archiving this station.'
      using errcode = '55000';
  end if;

  update public.stations
  set state = p_state, state_changed_by = auth.uid(), state_changed_at = now()
  where id = p_station_id;

  return jsonb_build_object('ok', true, 'state', p_state);
end;
$$;

comment on function public.admin_set_station_state(uuid, public.station_state) is
  'Archives or reactivates any station from the developer console. Admin-only.';

/* ------------------------------------------------------------------ */
/* 4. Delete                                                           */
/* ------------------------------------------------------------------ */

-- The whole station: its operational history, the manager and attendant
-- profiles posted to it, and the station row. One transaction, so a station
-- is either gone or untouched.
--
-- The purge itself delegates to reset_station_data() rather than repeating
-- its delete order. That order is load-bearing (audit rows before the rows
-- they protect, children before parents) and it has already been corrected
-- once as new tables landed; a second copy here would be the one that gets
-- forgotten next time.
--
-- Auth users are deliberately *not* deleted here: only the service key can do
-- that, and it never reaches a browser. The ids of the profiles removed come
-- back in the result so the `accounts` Edge Function can finish the job.
create or replace function public.admin_delete_station(p_station_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_staff uuid[];
begin
  if not public.is_admin() then
    raise exception 'Developer access is required.' using errcode = '42501';
  end if;

  select name into v_name from public.stations where id = p_station_id for update;
  if not found then
    raise exception 'Station not found.' using errcode = 'P0002';
  end if;

  perform public.reset_station_data(p_station_id);

  -- The logins that only existed to work this station.
  select coalesce(array_agg(id), '{}'::uuid[]) into v_staff
  from public.profiles
  where station_id = p_station_id
    and role in ('manager'::public.account_role, 'attendant'::public.account_role);

  update public.stations
  set state_changed_by = null
  where state_changed_by = any (v_staff);

  delete from public.profiles where id = any (v_staff);
  delete from public.stations where id = p_station_id;

  return jsonb_build_object(
    'ok', true,
    'station_id', p_station_id,
    'name', v_name,
    'deleted_logins', to_jsonb(v_staff)
  );
end;
$$;

comment on function public.admin_delete_station(uuid) is
  'Permanently removes a station: its operational history, the logins posted to it, and the station row. Admin-only; returns the profile ids whose Auth users the accounts Edge Function must delete.';

/* ------------------------------------------------------------------ */
/* 5. Profile details                                                  */
/* ------------------------------------------------------------------ */

-- A mistyped owner name or an old phone number should not need SQL access.
-- The username is intentionally not editable: it is half of the Auth login,
-- and rewriting it here would silently break that account's sign-in.
create or replace function public.admin_update_profile(
  p_uid uuid,
  p_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Developer access is required.' using errcode = '42501';
  end if;
  select * into v_row from public.profiles where id = p_uid for update;
  if not found then
    raise exception 'That account does not exist.' using errcode = 'P0002';
  end if;
  if v_row.role = 'admin'::public.account_role then
    raise exception 'Developer accounts are managed in Supabase Auth.'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'A name is required.' using errcode = '22023';
  end if;

  update public.profiles
  set name = btrim(p_name), phone = btrim(coalesce(p_phone, '')), updated_at = now()
  where id = p_uid
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

comment on function public.admin_update_profile(uuid, text, text) is
  'Corrects the name and phone number on an owner, manager, or attendant profile. Admin-only; the username and PIN are untouched.';

/* ------------------------------------------------------------------ */
/* 6. Grants                                                           */
/* ------------------------------------------------------------------ */

-- New functions default to EXECUTE for PUBLIC. Take that back first, then
-- hand them to authenticated only — each one re-checks is_admin() itself, so
-- a hand-written call from any other role is refused by the function body.
revoke execute on function
  public.admin_station_registry(),
  public.admin_create_station(uuid, text, text),
  public.admin_update_station(uuid, text, text, uuid),
  public.admin_set_station_state(uuid, public.station_state),
  public.admin_delete_station(uuid),
  public.admin_update_profile(uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.admin_station_registry(),
  public.admin_create_station(uuid, text, text),
  public.admin_update_station(uuid, text, text, uuid),
  public.admin_set_station_state(uuid, public.station_state),
  public.admin_delete_station(uuid),
  public.admin_update_profile(uuid, text, text)
to authenticated;
