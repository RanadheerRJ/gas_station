# RBAC verification harness

Behavioural proof that the role matrix is enforced by the **database**, not by
route guards or hidden buttons. The suite signs in as each role against a real
PostgreSQL instance running the real migrations and asserts what that role can
and cannot read or write.

## Why this exists

`npm run check:schema` is a static contract check — it catches a renamed RPC or
a policy that stopped being owner/manager gated, but it cannot prove that an
attendant is actually unable to read a co-worker's takings. This harness does,
and it needs no Docker and no hosted Supabase project.

## Running it

```bash
npm run test:rbac
```

The script downloads a self-contained PostgreSQL binary on first run, starts it
on a private socket, applies `supabase/migrations/*.sql` in order, seeds a
two-station tenancy, and runs the assertions. It tears the server down
afterwards.

`scripts/rbac/bootstrap.sql` is a minimal local stand-in for the parts of a
Supabase project the migrations depend on: the `auth` schema, `auth.uid()`, and
the `anon` / `authenticated` / `service_role` roles.

## What is covered

| Role | Asserted |
| --- | --- |
| Developer/admin | Reads no station, shift, price, tank, or credit data; cannot record stock movements; can still list profiles to provision accounts; the admin-only `admin_station_registry()` RPC returns the station registry (id, name, address, state, owner) while the stations table itself still returns nothing |
| Owner | Full access to their own stations; no visibility of another owner's stations |
| Manager | Operational and financial data for their station; can review shifts, move balances, record stock; sees the manager and attendant roster posted to their own station — and no staff, owner, or profile from anywhere else |
| Attendant | Own shift records only; sees stations/pumps/nozzles and anonymous nozzle occupancy; no co-worker identities (including their own profile only), no credit ledger, prices, tanks, or tank readings; cannot write to another operator's shift or to restricted tables. May record credit sales at their **own** shift close — against an existing customer (via the balance-free `list_customer_directory`) or a new walk-in — with rows attributed to them; the credit ledger itself still returns nothing |
| Anonymous | Granted nothing, including the registry RPC |
| Exports | Every report read is scoped by the server: an attendant's export request returns only their own shifts and cannot name a co-worker even when the shift id is supplied directly; owner and manager exports keep their existing reach |

The harness applies `20260919000000_initial_schema.sql`,
`20260919010000_tighten_role_visibility.sql`,
`20260920120000_admin_registry_and_manager_staff.sql`, and
`20260921000000_attendant_credit_at_close.sql`. The meter/stock
migration (`20260920000000`) is deliberately left out: it postdates the
role-matrix contract this suite pins and intentionally changes attendant dip
semantics.

## Negative control

The assertions are only meaningful if they fail without the follow-up
migrations. To confirm that:

```bash
npm run test:rbac -- --without-rbac
```

Against the initial schema alone this reports **38 failures** — the exact
exposure that `20260919010000_tighten_role_visibility.sql` (role-matrix
tightening), `20260920120000_admin_registry_and_manager_staff.sql` (the
manager roster and the admin-only station registry), and
`20260921000000_attendant_credit_at_close.sql` (the guarded attendant credit
path and its balance-free directory) close.
