-- Station Ledger: developer-portal station registry and manager staff access.
--
-- Two gaps this closes.
--
-- 1. The developer portal counted every owner's stations as zero. Owner
--    profiles carry no station_id — the check constraint on profiles forces
--    station_id to be null for owners, because ownership runs through
--    stations.owner_id — and the stations table is deliberately unreadable to
--    a developer, so the browser had no way to count what an owner owns.
--
--    The fix is a dedicated admin-only SECURITY DEFINER RPC that returns the
--    station *registry*: id, name, address, state, and owner. That is account
--    provisioning metadata, not operational data. The stations table policy
--    is untouched: a developer still reads no shifts, prices, tanks, credit
--    customers, pumps, or nozzles, and `select * from stations` still returns
--    nothing to a developer. The RBAC harness pins that down.
--
-- 2. A manager could not see their station's roster, so a forgotten
--    attendant PIN needed the owner. The profiles read policy now also lets a
--    manager read the manager and attendant profiles posted to their own
--    station — co-worker identity the role matrix already shows managers on
--    shift rows. Attendants see nothing extra (the helper below returns null
--    for them), owners stay keyed on owner_id, and developers keep
--    is_admin().

/* ------------------------------------------------------------------ */
/* 1. Manager station helper                                            */
/* ------------------------------------------------------------------ */

-- SECURITY DEFINER on purpose: the profiles policy below calls this, and a
-- plain subquery against profiles inside its own policy would recurse. The
-- function reads one column of the caller's own row and nothing else.
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

comment on function public.manager_station_id() is
  'The calling manager''s station_id, or null for every other role. Lets the profiles policy show a manager exactly their own station''s staff without recursing.';

/* ------------------------------------------------------------------ */
/* 2. Profiles: a manager sees their station's staff                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 3. Admin-only station registry                                       */
/* ------------------------------------------------------------------ */

-- One row per station: what the developer portal needs to show how many
-- stations each owner has and support the accounts it issued. Admin-only,
-- and it carries no shift, price, tank, or credit data.
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

comment on function public.admin_station_registry() is
  'Station registry for account provisioning support: id, name, address, state, and owner. Admin-only; deliberately exposes no operational, financial, or stock data.';

/* ------------------------------------------------------------------ */
/* 4. Grants                                                            */
/* ------------------------------------------------------------------ */

-- New functions default to EXECUTE for PUBLIC. Take that back, then hand back
-- the two the browser path needs: the registry for the developer console, and
-- manager_station_id because the profiles policy calls it on every read (the
-- initial migration grants is_admin() to authenticated for exactly this
-- reason). manager_station_id only ever returns the caller's own station.
revoke execute on function
  public.admin_station_registry(),
  public.manager_station_id()
from public, anon, authenticated;

grant execute on function
  public.admin_station_registry(),
  public.manager_station_id()
to authenticated;
