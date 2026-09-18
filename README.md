# Station Ledger

Daily operations and ledger management for fuel stations — multi-station,
role-scoped, username + PIN login. React (Vite) on the front, Firebase Auth +
Firestore + Cloud Functions behind it.

## Roles

| Role | Created by | Scope | Can |
| --- | --- | --- | --- |
| Developer | manual, once | — | Invite station owners |
| Owner | Developer | all their stations | Add stations, invite staff, full ledger, credit accounts |
| Manager | Owner | one station | Full ledger for that station, correct past entries |
| Attendant | Owner | one station | Log today's sales, readings and cash — no edits, no deletes |

Nobody signs themselves up. Every account is created by the tier above it, via
Cloud Functions using the Admin SDK.

## How login works

Firebase Auth has no username+PIN mode, so it is built explicitly:

1. `createOwner` / `createStaff` generate a username (slug of the person's
   name, numerically de-duplicated) and a random 4-digit PIN.
2. The PIN is bcrypt-hashed into `authSecrets/{uid}` — a collection that
   Firestore rules make unreadable and unwritable from every client. Only the
   Admin SDK touches it. The raw PIN is returned to the inviter exactly once
   and is never stored or logged.
3. The client calls the `pinLogin` callable with `{ username, pin }`. On a
   match the function mints a custom token with
   `admin.auth().createCustomToken(uid)`, and the client calls
   `signInWithCustomToken`. That is the only path from a PIN to a session.
4. Custom claims are set at creation so rules check roles without extra reads:
   - Owner — `{ role: 'owner', ownerId: <own uid> }`
   - Manager/Attendant — `{ role, ownerId, stationId }`

Repeated failures against a username are rate-limited (8 attempts per 15
minutes) in `loginAttempts/{username}`.

## Project layout

```
src/
  lib/        firebase init, api facade, formatters, local demo backend
  state/      auth context, station loader
  components/ layout, ledger entry form, shared UI primitives
  pages/      login, developer admin, owner dashboard, ledger, credit, staff
functions/    createOwner, createStaff, addStation, pinLogin
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

Verify the ledger maths and access logic without a browser:

```bash
node scripts/smoke.mjs
```

## Data model

```
users/{uid}                name, phone, role, ownerId, stationIds[], username, createdAt
stations/{stationId}       name, address, ownerId, createdAt
usernames/{username}       uid                        (no client access)
authSecrets/{uid}          pinHash                    (no client access, ever)
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
- PINs never appear in Firestore, in function logs, or in any error message —
  failed logins return a deliberately vague "Incorrect username or PIN."
