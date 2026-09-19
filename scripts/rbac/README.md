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
| Developer/admin | Reads no station, shift, price, tank, or credit data; cannot record stock movements; can still list profiles to provision accounts |
| Owner | Full access to their own stations; no visibility of another owner's stations |
| Manager | Operational and financial data for their station; can review shifts, move balances, record stock |
| Attendant | Own shift records only; sees stations/pumps/nozzles and anonymous nozzle occupancy; no co-worker identities, no credit, prices, tanks, or tank readings; cannot write to another operator's shift or to restricted tables |
| Anonymous | Granted nothing |
| Exports | Every report read is scoped by the server: an attendant's export request returns only their own shifts and cannot name a co-worker even when the shift id is supplied directly; owner and manager exports keep their existing reach |

## Negative control

The assertions are only meaningful if they fail without the follow-up
migration. To confirm that:

```bash
npm run test:rbac -- --without-rbac
```

Against the initial schema alone this reports **31 failures** — the exact
exposure that `20260919010000_tighten_role_visibility.sql` closes.
