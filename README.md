# Station Ledger

Daily operations and ledger management for fuel stations — multi-station,
role-scoped, username + PIN login. React (Vite) on the front, Firebase Auth +
Firestore + Cloud Functions behind it.

## Roles

| Role | Created by | Scope | Can |
| --- | --- | --- | --- |
| Developer | manual, once | — | Invite station owners, reset any owner's PIN |
| Owner | Developer | all their stations | Add stations, invite staff, reset their staff's PINs, full ledger, credit accounts |
| Manager | Owner | one station | Full ledger for that station, correct past entries |
| Attendant | Owner | one station | Log today's sales, readings and cash — no edits, no deletes |

Nobody signs themselves up. Every account is created by the tier above it, via
Cloud Functions using the Admin SDK.

## How login works

Firebase Auth has no username+PIN mode, so it is built explicitly:

1. `createOwner` / `createStaff` generate a username (slug of the person's
   name, numerically de-duplicated). The **PIN is chosen by whoever creates
   the account** — the developer sets the owner's, the owner sets each staff
   member's — and is confirmed twice in the form before submission.
2. The PIN is bcrypt-hashed into `authSecrets/{uid}` — a collection that
   Firestore rules make unreadable and unwritable from every client. Only the
   Admin SDK touches it. The raw PIN is never stored, logged, or returned by
   any function; the creator already knows it because they chose it.
   Trivially guessable PINs (`1234`, `0000`, runs, repeated digits) are
   rejected server-side, so a weak choice cannot reach the database.
3. The client calls the `pinLogin` callable with `{ username, pin }`. On a
   match the function mints a custom token with
   `admin.auth().createCustomToken(uid)`, and the client calls
   `signInWithCustomToken`. That is the only path from a PIN to a session.
4. Custom claims are set at creation so rules check roles without extra reads:
   - Owner — `{ role: 'owner', ownerId: <own uid> }`
   - Manager/Attendant — `{ role, ownerId, stationId }`
5. `resetPin` rotates a forgotten PIN. Authority runs strictly **down** the
   hierarchy and is enforced in the function, not the UI: a developer may
   reset an owner, an owner may reset only their own manager/attendant
   accounts. Peer-to-peer and upward resets are refused. A reset also clears
   any active lockout so the user isn't locked out of fresh credentials.

Repeated failures against a username are rate-limited (8 attempts per 15
minutes) in `loginAttempts/{username}`.

## Project layout

```
src/
  lib/        firebase init, api facade, formatters, local demo backend
  state/      auth context, station loader
  components/ layout, ledger entry form, shared UI primitives
  pages/      login, developer admin, owner dashboard, ledger, credit, staff
functions/    createOwner, createStaff, addStation, resetPin, pinLogin
scripts/      setAdminClaim.js (one-off), smoke.mjs (logic tests)
firestore.rules
```

## Firebase setup

1. Create a Firebase project. Enable **Authentication** (Email/Password, for
   the developer account only) and **Cloud Firestore**.
2. Register a Web app, then copy its config into `.env.local`:

   ```bash
   cp .env.example .env.local
   # fill in VITE_FIREBASE_* from Project settings > Your apps
   ```

3. Install and log in to the CLI, then pick the project:

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add
   ```

### Deploy rules and functions

```bash
cd functions && npm install && cd ..

firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

Cloud Functions v2 requires the Blaze plan.

### Set the developer's admin claim

The developer is the one account the app does not create:

1. Firebase console → Authentication → **Add user** (email + password).
2. Project settings → Service accounts → **Generate new private key**, saved
   as `serviceAccountKey.json` in the repo root (already git-ignored).
3. Run it once:

   ```bash
   node scripts/setAdminClaim.js you@example.com
   ```

Equivalently with the CLI: `firebase auth:import` with a `customClaims` field,
or any Admin SDK snippet calling
`setCustomUserClaims(uid, { admin: true })`.

Sign out and back in afterwards so the client picks up the new claim.

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle into dist/
```

**Demo mode.** With no `.env.local` present the app runs against a local
backend stored in `localStorage`, seeded with two stations, a few days of
entries and credit customers, so you can click through every role before a
Firebase project exists. The sign-in screen lists the demo logins. Add real
credentials and the same UI talks to Firestore and Cloud Functions instead —
no code changes.

Demo PINs are the ones seeded in `src/lib/demoBackend.js`; in a real project
every PIN is whatever the creator typed.

Verify the ledger maths and access logic without a browser:

```bash
node scripts/smoke.mjs
```

## Data model

```
users/{uid}                name, phone, role, ownerId, stationIds[], username, createdAt
stations/{stationId}       name, address, ownerId, createdAt
usernames/{username}       uid                        (no client access)
authSecrets/{uid}          pinHash, setBy, updatedAt  (no client access, ever)
loginAttempts/{username}   failedCount, lastFailedAt  (no client access)

ledger/{stationId}/entries/{entryId}
  date, enteredBy, enteredByName, createdAt,
  fuelSales:    { [fuelType]: { litres, ratePerLitre, amount } },
  tankReadings: { [fuelType]: { opening, closing } },
  cashIn, cashOut,
  expenses:     [ { label, amount } ],
  creditSales:  [ { customerId, name, amount } ]

creditCustomers/{stationId}/customers/{customerId}
  name, phone, outstandingBalance, createdAt,
  transactions: [ { date, type: 'credit'|'payment', amount, note } ]
```

Cash in hand for a day is derived, never stored:
`fuel sales + cash in − credit sales − expenses − cash out`.

## Security posture

- `users`, `usernames`, `authSecrets`, `stations` accept **no client writes**.
  All account and station creation flows through Cloud Functions, where the
  Admin SDK bypasses rules.
- `authSecrets`, `usernames` and `loginAttempts` are fully closed to clients
  in both directions.
- Station access is resolved by a rules helper matching the station's
  `ownerId` against the caller's `ownerId` claim (owners span many stations)
  or the caller's `stationId` claim (single-station staff).
- Ledger entries: anyone with station access can read and create; only
  `owner` and `manager` may update or delete. Creates must carry the caller's
  own uid in `enteredBy`, so entries are always attributable.
- `createStaff` re-checks server-side that the target station belongs to the
  calling owner before creating anything.
- `resetPin` re-derives the caller's authority from their token and the
  target's `ownerId`, so hiding a button is never what keeps an account safe.
- PINs never appear in Firestore, in function logs, or in any error message —
  failed logins return a deliberately vague "Incorrect username or PIN."
