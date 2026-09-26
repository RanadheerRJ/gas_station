# PÉTRAV

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
- `supabase/migrations/20260920120000_admin_registry_and_manager_staff.sql` —
  the admin-only station registry RPC behind the developer portal's station
  counts, and manager visibility of their own station's staff.
- `supabase/functions/accounts/index.ts` — privileged account provisioning and
  PIN reset Edge Function.
- `src/lib/supabase.js` — browser client initialization.
- `src/lib/api.js` — the only browser data-access module.

No Firebase credentials or service account key should remain in this project.

## Reporting and exports

Daily Ledger, Shifts, Credit Customers, and Ground Stock each carry a date
range and a pair of export buttons (`src/components/ReportTools.jsx`).

- The range control filters the on-screen table and the export from the same
  piece of state, so a downloaded file always matches what was displayed for
  the selected station, dates, and status.
- CSV and PDF are generated in the browser by `src/lib/export.js`. CSV fields
  are escaped per RFC 4180; the PDF is a hand-written PDF 1.4 document, which
  avoids a heavyweight dependency for what is a monospaced table.
- Filenames always carry the station and the window, e.g.
  `petrav-shifts-cityctr-2026-09-01_2026-09-19.csv`.
- Exports are on demand only. Nothing is written back — there is no
  saved-report table — and `src/lib/export.js` imports no Supabase client: it
  is handed rows that already came through `src/lib/api.js`, so RLS has
  already decided what the caller may see. `npm run test:rbac` proves the
  server refuses an attendant another operator's shift even for a hand-crafted
  request.
- Report column headings stay in English regardless of interface language,
  because spreadsheets and the PDF standard fonts cannot be relied on to carry
  Telugu or Devanagari text.

## Languages

The interface ships in English, Telugu, and Hindi. The dictionaries live in
`src/state/translations.js` and are served by a deliberately small context
(`src/state/LanguageContext.jsx`) rather than an i18n dependency — the app
needs key lookup and one placeholder substitution.

- The selector sits on the login card and in the authenticated sidebar. The
  choice is per device, persisted in `localStorage`, and defaults to English.
- Raw user data is never translated: staff and customer names, station names,
  notes, expense labels, and invoice numbers are shown exactly as entered.
- `src/state/translations.test.js` fails the build if a key is missing from
  Telugu or Hindi, if a placeholder is dropped in translation, or if a
  component asks for a key that does not exist — so missing-key text cannot
  reach a screen.

## Brand

The app is branded **PÉTRAV** (PET-RAV) — Fuel + ₹ + Time: a blue fuel pump
with a ₹ display, a fuel drop, a red nozzle, and a clock overlapping the
lower right. The palette is the Indian fuel-retail blue/red/white family
(`#063B8F`, `#0B5BC6`, `#E31B23`, white), deliberately not any particular
marketer's logo.

- `src/components/branding.jsx` — the live artwork used by the app bar,
  sidebar, login card and boot screen. Inline SVG on a 96-unit grid, themed
  through CSS custom properties (`--petrav-*` in `styles.css`) so dark mode
  needs no second asset. The wordmark is monoline geometry, not a font.
- `src/assets/branding/` — the master files: full logo, horizontal lockup,
  icon, monochrome icon, maskable icon, and a self-animated loading logo.
  See `src/assets/branding/README.md` for the usage matrix.
- `public/` — `favicon.svg` (simplified pump, for the browser tab),
  `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
  (artwork inside the Android safe zone), `apple-touch-icon.png`, and
  `logo.svg` (the rounded-square tile referenced by the manifest).
- `scripts/branding/build-branding.mjs` — regenerates every file above from
  one geometry table: `node scripts/branding/build-branding.mjs` writes the
  SVGs; with `npm i --no-save sharp` present it also rasterises the PNGs
  and rebuilds `favicon.ico`.

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
| Credit customers & balances | ❌ | ✅ | ✅ | ❌ ledger; credit sales at own shift close only, via a balance-free name/phone directory |
| Fuel-price history | ❌ | ✅ | ✅ | ❌ |
| Tanks & tank readings | ❌ | ✅ | ✅ | ❌ |
| Review/approve shifts | ❌ | ✅ | ✅ | ❌ |
| Station registry (names & counts) | ✅ admin-only RPC | own stations | own station | own station |
| Reset someone's PIN | ✅ any PIN account | own staff | own station's staff, not self | ❌ |
| Reset own PIN | — (signs in with a password) | ✅ with current PIN | ✅ with current PIN | ✅ with current PIN |
| Reset station data | ✅ any station | own stations | ❌ | ❌ |

A developer account provisions accounts and nothing else: it cannot read any
station, shift, price, tank, or credit row. The one deliberate carve-out is
`admin_station_registry()`, an admin-only RPC that returns the station
*registry* — id, name, address, state, and owner — so the developer portal can
show how many stations each owner has. It carries no operational, financial,
or stock data, and `select * from stations` still returns nothing to a
developer.

### PIN reset authority

The `accounts` Edge Function is the only code that can change a password, and
it re-checks authority on every call:

| Caller | May reset |
| --- | --- |
| Developer | any owner, manager, or attendant PIN |
| Owner | the managers and attendants they issued logins to |
| Manager | the managers and attendants posted to their station, never their own |
| Anyone with a PIN | their own, after proving the current PIN (checked through a real Auth sign-in) |

A manager's roster comes from the profiles policy: a manager sees exactly the
manager and attendant profiles posted to their station — no other station's
staff, no owner accounts, and attendants still see only themselves.

An attendant can see the stations, pumps, and nozzles needed to start a shift,
and calls `list_nozzle_occupancy(p_station_id)` for availability. That RPC
returns **busy nozzle ids only** — no shift id, operator, reading, or amount —
so the forecourt board can show a pump as busy without naming who has it.

`guard_attendant_writes()` is the backstop. Mutation RPCs are
`SECURITY DEFINER`, so RLS does not apply inside them, but row triggers still
fire: an attendant cannot modify another employee's shift, nor touch credit,
price, or stock rows directly. The trigger admits credit and stock writes only
when they arrive from inside a trusted `SECURITY DEFINER` RPC (detected by
`current_user` not being `authenticated`/`anon`), which for credit means
exactly one attendant path: `close_shift` on their own shift. There the
attendant may record credit sales — against an existing customer picked from
`list_customer_directory(p_station_id)` (id, name, phone; deliberately
balance-free) or as a new walk-in — and every such row is stamped with
`recorded_by` and lands in a shift that still goes to `pending_review`.
`create_customer` and `record_customer_transaction` keep asserting
owner/manager, so an attendant still cannot open accounts, record payments, or
move balances outside a shift close, and the credit ledger (balances, history)
remains unreadable to them.

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
npm test                 # unit tests: shift/tank maths, exports, translations, credentials
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
npm run test:rbac -- --without-rbac    # 34 failures: the exposure the follow-up migrations close
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
   including `20260919010000_tighten_role_visibility.sql` and
   `20260920120000_admin_registry_and_manager_staff.sql`. Apply them **before**
   publishing the matching frontend: without the registry RPC the developer
   portal shows an em dash instead of station counts, and without the profiles
   policy a manager cannot open their team page. The follow-up migrations are
   idempotent and safe to re-run; never edit the already-applied initial
   migration to change production RBAC.
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
