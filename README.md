# Station Ledger

A role-scoped fuel-station ledger: username + PIN access for owners, managers,
and attendants; meter-driven shifts; ground stock; customer credit; and daily
cash review.

The application uses **React/Vite** in the browser and **Supabase** for Auth,
PostgreSQL, Row Level Security (RLS), Edge Functions, and atomic RPCs.

## What changed

Firebase, Firestore rules, Cloud Functions, emulator tests, and Firebase SDKs
have been removed. The source of truth is now:

- `supabase/migrations/20260919000000_initial_schema.sql` — tables, RLS,
  indexes, and database RPCs.
- `supabase/migrations/20260919010000_tighten_role_visibility.sql` — the role
  matrix: self-only attendant reads, owner/manager-only financial and stock
  reads, anonymous nozzle occupancy, and the attendant write guards.
- `supabase/functions/accounts/index.ts` — privileged account provisioning and
  PIN reset Edge Function.
- `src/lib/supabase.js` — browser client initialization.
- `src/lib/api.js` — the only browser data-access module.

No Firebase credentials or service account key should remain in this project.

## Security model

### Auth and roles

- Developers sign in using their normal Supabase Auth email/password account.
- Owners, managers, and attendants sign in with a generated username and a
  four-digit PIN. The username maps to an internal, non-deliverable Auth email;
  Supabase Auth hashes the derived password. Raw PINs and password hashes are
  never stored in public database tables.
- Self-sign-up is disabled. Developers create owners; owners create their own
  managers and attendants through the `accounts` Edge Function.
- The Edge Function is the **only** code that uses `SUPABASE_SERVICE_ROLE_KEY`.
  That key must never be placed in a Vite variable, Pages variable, or browser
  bundle.

### Role matrix

Operational and financial data is private. Route guards and hidden buttons are
**not** the boundary — Supabase RLS, `SECURITY DEFINER` RPCs, and row triggers
are, so a hand-written PostgREST or RPC call is refused exactly like a click is.

| | Developer | Owner | Manager | Attendant |
| --- | --- | --- | --- | --- |
| Provision accounts | ✅ | own staff | — | — |
| Station operational data | ❌ | own stations | assigned station | availability only |
| Shifts | ❌ | all | all | **own only** |
| Other operators' identities | ❌ | ✅ | ✅ | ❌ shown as “Another operator” |
| Credit customers & balances | ❌ | ✅ | ✅ | ❌ |
| Fuel-price history | ❌ | ✅ | ✅ | ❌ |
| Tanks & tank readings | ❌ | ✅ | ✅ | ❌ |
| Review/approve shifts | ❌ | ✅ | ✅ | ❌ |

A developer account provisions accounts and nothing else: it cannot read any
station, shift, price, tank, or credit row.

An attendant can see the stations, pumps, and nozzles needed to start a shift,
and calls `list_nozzle_occupancy(p_station_id)` for availability. That RPC
returns **busy nozzle ids only** — no shift id, operator, reading, or amount —
so the forecourt board can show a pump as busy without naming who has it.

`guard_attendant_writes()` is the backstop. Mutation RPCs are
`SECURITY DEFINER`, so RLS does not apply inside them, but row triggers still
fire: an attendant cannot modify another employee's shift, nor touch credit,
price, or stock rows, even by calling an RPC directly.

### Database access

All application tables have RLS enabled. An authenticated user can read only
stations they own or are assigned to, narrowed further by the role matrix
above. Browsers have no table write policies. Writes go through
`SECURITY DEFINER` PostgreSQL RPCs, which check the current `auth.uid()` and
role before changing state.

The financial and operational critical paths are one transaction each:

| RPC | Atomic work |
| --- | --- |
| `open_shift` | verifies station/nozzle/price access, snapshots price and meter, and claims each nozzle using a partial unique index |
| `close_shift` | locks the open shift, advances every nozzle meter, creates/matches walk-in credit customers, posts credit transactions, updates balances, and submits the shift |
| `record_customer_transaction` | locks a customer, prevents overpayment, updates the balance, and appends an audit transaction |
| `record_dip` / `record_delivery` | locks the tank, validates capacity/state, writes the reading, and updates current stock |

The `shift_nozzles_one_open_shift` partial unique index is the last-line
concurrency guard: two simultaneous requests cannot put one nozzle in two open
shifts.

## Local setup

### 1. Create a Supabase project

Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
In **Authentication → Providers**, keep Email enabled and turn off **Enable new
users**. This prevents anyone from creating an account outside the issuer
workflow.

Install the Supabase CLI if it is not already installed:

```bash
npm install --global supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Apply the schema and deploy the account function

```bash
supabase db push
supabase functions deploy accounts
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Do not copy the service
role key into a local browser environment.

The migration grants the account-provisioning RPCs only to `service_role`; the
`accounts` Edge Function is the intended caller.

### 3. Bootstrap the first developer

1. In **Authentication → Users**, create your developer email/password user.
2. Copy that user’s UUID.
3. In the SQL editor, insert its profile (substitute the UUID and name):

```sql
insert into public.profiles (id, name, role)
values ('YOUR_AUTH_USER_UUID', 'Station Developer', 'admin');
```

The developer can now sign in through the Developer tab and issue the first
owner account. Owner and staff profiles are created automatically with the
correct role and station relationship.

### 4. Configure the front end

```bash
cp .env.example .env.local
```

Set these values from **Project Settings → API**:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

The anonymous/publishable key is designed to be embedded in a browser app.
RLS, Auth, and RPC authorization protect the data; it is **not** the service
role key.

Run the app:

```bash
npm install
npm run dev
```

## GitHub Pages

The included workflow builds and deploys from `main` with the official GitHub
Pages actions. It automatically uses the repository name as Vite’s base path,
so project sites publish under `/<repository>/`.

Before the first deployment, create these **repository Actions variables** in
**Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

They are injected only during the Pages build. The deploy workflow fails early
if either is missing or if Firebase code appears in `dist/`. In repository
settings, set **Pages → Source** to **GitHub Actions**.

## Tests and checks

```bash
npm test                 # unit tests for shift/tank maths and Auth credential derivation
npm run check:schema     # migration contract guard used by CI
npm run test:rbac        # role matrix enforced against a real PostgreSQL instance
npm run lint
npm run format:check
npm run build
npm run check
```

`npm run test:rbac` is the behavioural proof of the table above. It fetches a
self-contained PostgreSQL build on first run, applies `supabase/migrations/*`
in order, seeds a two-station tenancy, then signs in as each role and asserts
what it can and cannot read or write. No Docker and no hosted project needed.

To confirm those assertions are not vacuous, run them against the initial
schema alone:

```bash
npm run test:rbac -- --without-rbac    # 24 failures: the exposure the follow-up migration closes
```

See `scripts/rbac/README.md` for the full coverage list.

For a local Supabase database test run, start the Supabase stack and run:

```bash
supabase start
supabase test db
```

`supabase/tests/database_test.sql` verifies the RLS boundary, the role-matrix
helpers, and the attendant write guards. GitHub Actions runs the fast
Docker-free migration contract check and the RBAC suite on every pull request
and before every Pages deployment.

## Deployment checklist

1. `supabase db push` — applies any migration the hosted project has not seen,
   including `20260919010000_tighten_role_visibility.sql`. Apply it **before**
   publishing the matching frontend. The follow-up migration is idempotent and
   safe to re-run; never edit the already-applied initial migration to change
   production RBAC.
2. `supabase functions deploy accounts`
3. Create the first developer profile via SQL.
4. Disable Auth self-sign-up.
5. Add the two Pages Actions variables.
6. Enable GitHub Pages from **GitHub Actions**.
7. Push to `main` or run **Deploy to GitHub Pages** manually.

## Operational notes

- Price records are effective-dated. `open_shift` snapshots a price, so a later
  rate change never rewrites a past shift.
- Tank and station deletion are intentionally absent. Assets are retired or
  archived so the audit record remains intact.
- Closing a shift posts credit sales only once, in the same transaction that
  marks it pending review. Retrying a completed close fails rather than
  duplicating debt.
- Service worker caching is shell-only. Supabase Auth, REST, and Function
  traffic always stays on the network; fuel prices and balances are never
  cached as offline data.
