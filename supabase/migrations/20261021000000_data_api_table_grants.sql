-- Data API exposure after Supabase stopped granting it for free.
--
-- From 30 October 2026 Supabase no longer auto-grants table privileges to the
-- API roles (anon, authenticated, service_role) for tables created in "public".
-- A table without an explicit GRANT answers supabase-js, PostgREST, and GraphQL
-- with "permission denied for table …" no matter what its RLS policies say —
-- the grant is checked before any policy runs. That includes every replay of
-- this schema: a new project, a preview branch, and `supabase db reset`.
--
-- This migration makes the exposure explicit and self-healing:
--
--   1. It grants the API roles what they relied on for the tables that already
--      exist, so a replayed schema behaves like the hosted project did before
--      the change. The list comes from the catalog, not from a hand-kept
--      inventory, so a table this migration has never heard of is still covered.
--   2. It installs default privileges, so a table created by a later migration
--      is reachable through the Data API without anyone remembering the GRANT.
--
-- The grants stay deliberately narrow and match the security model in README
-- ("Database access"):
--
--   authenticated — SELECT only. Browsers have no table write policies; every
--                   mutation goes through a SECURITY DEFINER RPC, which runs as
--                   its definer and does not need the caller's table grant.
--   service_role  — SELECT, INSERT, UPDATE, DELETE. This is the Edge Function
--                   credential (supabase/functions/accounts reads profiles and
--                   stations directly). It bypasses RLS, so it is the widest
--                   grant in the project and never reaches the browser.
--   anon          — nothing, and that is intentional. Every RLS policy here is
--                   `to authenticated`, so an anonymous SELECT could only ever
--                   return zero rows. The anonymous start-shift screen gets
--                   nozzle availability through an RPC, not a table. A GRANT
--                   would widen the surface without adding a single visible row.
--
-- Idempotent and additive: safe to re-run, and it never removes a grant an
-- earlier migration made.

/* 1. Backfill the tables that already exist --------------------------- */

do $$
declare
  v_relation record;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- Not a Supabase-shaped database: there are no API roles to expose to.
    return;
  end if;

  -- The API roles need USAGE on the schema before any table in it is visible
  -- to them. Supabase grants this already; re-granting is a no-op where so.
  execute 'grant usage on schema public to authenticated, service_role';

  for v_relation in
    select c.relname, pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v')
    order by c.relname
  loop
    execute format('grant select on table public.%I to authenticated', v_relation.relname);
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      v_relation.relname
    );

    -- A relation owned by some other role also needs that role's default
    -- privileges, or the next table it creates is unreachable again.
    if v_relation.owner <> current_user then
      begin
        execute format(
          'alter default privileges for role %I in schema public'
          ' grant select on tables to authenticated',
          v_relation.owner
        );
        execute format(
          'alter default privileges for role %I in schema public'
          ' grant select, insert, update, delete on tables to service_role',
          v_relation.owner
        );
      exception when insufficient_privilege then
        raise notice 'Data API default privileges skipped for role %: %',
          v_relation.owner, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;

/* 2. Keep tables created later reachable ------------------------------ */

-- Migrations run as a superuser: the Management API and `supabase db push` both
-- connect as `postgres`. Default privileges are per-owner, so they are
-- installed for every role that could plausibly create a table in public —
-- the superusers, anything already holding CREATE on the schema, and whoever
-- is running this migration. Re-issuing an identical rule is a no-op, and a
-- role this connection may not act for is skipped with a notice rather than
-- failing the deploy: the per-table GRANTs in each migration remain the
-- primary defence, and `npm run check:schema` enforces them.
do $$
declare
  v_owner text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role') then
    return;
  end if;

  for v_owner in
    select rolname
    from pg_roles
    where (rolsuper and rolcanlogin)
       or has_schema_privilege(oid, 'public', 'CREATE')
    union
    select current_user
    order by 1
  loop
    begin
      execute format(
        'alter default privileges for role %I in schema public'
        ' grant select on tables to authenticated',
        v_owner
      );
      execute format(
        'alter default privileges for role %I in schema public'
        ' grant select, insert, update, delete on tables to service_role',
        v_owner
      );
    exception when insufficient_privilege then
      raise notice 'Data API default privileges skipped for role %: %', v_owner, sqlerrm;
    end;
  end loop;
end;
$$;

comment on schema public is
  'Tables here reach the Data API by explicit GRANT: SELECT to authenticated (RLS narrows every read; writes go through SECURITY DEFINER RPCs) and SELECT/INSERT/UPDATE/DELETE to service_role for the accounts Edge Function. anon holds no table grants on purpose. Since 30 October 2026 Supabase no longer grants these automatically, so a migration that creates a table must grant them itself — or rely on the default privileges installed by 20261021000000_data_api_table_grants.sql.';
