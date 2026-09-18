# Station Ledger

Daily operations and ledger management for fuel stations — multi-station,
role-scoped, username + PIN login. React (Vite) on the front, Firebase Auth +
Firestore + Cloud Functions behind it.

## Roles

| Role | Created by | Scope | Can |
| --- | --- | --- | --- |
| Developer | manual, once | — | Invite station owners, reset any owner's PIN |
| Owner | Developer | all their stations | Add stations, configure pumps/nozzles/rates, invite staff, reset PINs, full ledger |
| Manager | Owner | one station | Open/close shifts, daily ledger, credit accounts |
| Attendant | Owner | one station | Open and close shifts — no edits, no deletes |

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

## Sales are derived, never typed

There is no manual sales entry anywhere in the app. Every figure traces back
to a nozzle's meter.

1. An owner registers **pumps** and **nozzles** once, entering each nozzle's
   current totaliser reading and the fuel it dispenses.
2. The owner sets a **rate per fuel type**, updated whenever prices move.
3. An operator **starts a shift by ticking the nozzles they are taking**.
   That snapshots each chosen nozzle's current reading as the opening, plus
   the price in force — so a later price change never reprices a shift that
   already ran. A nozzle can only be in one open shift, so several operators
   work different pumps at the same time; the forecourt board shows each pump
   as free or busy, and who is fuelling.
4. At handover the operator enters **only the closing reading** per nozzle.
   The set of nozzles cannot change once the shift is running.
   Litres are `closing − opening`, and the amount is `litres × snapshotted
   price`. A meter that wraps past its digit limit is handled rather than
   reported as a negative sale.
5. Closing the shift **advances only that shift's nozzles** to their closing
   figures, so the next shift on those nozzles opens exactly where this one
   ended and a concurrent shift elsewhere is untouched. Credit sales post to
   customer accounts in the same transaction.

### Cash reconciliation

Closing a shift asks what was actually collected, and works down to the one
figure the operator hands across the counter:

```
gross     = Σ (litres × price) per nozzle
net due   = gross − testing − expenses
collected = cash + card + UPI + credit + other
variance  = collected − net due
handover  = net due − (card + UPI + credit + other)
```

Collections are split by mode (cash, card, UPI, credit, other) rather than a
single figure, which is how a forecourt actually settles. `handover` strips the
money that never reached the drawer — card, UPI and credit settle elsewhere —
leaving the physical cash owed to the owner. A negative variance is a short
drawer, shown in rust; within ₹1 it reads as balanced. The variance rolls up
per day, per station, and across all stations on the owner's dashboard.

### Daily fuel testing

Every pump is test-dispensed each day and the fuel goes straight back into the
tank. The meter counted it, but no money was ever collected, so it cannot be
owed to the owner. Closing a shift takes two figures — the rupee value tested
on **MS** (petrol) and on **HSD** (diesel) — and both come off gross before net
is calculated. They are stored separately rather than as a single number so the
owner can see at review which product the deduction belongs to.

### Shifts are reviewed before they are final

Closing a shift does not finalise it. A shift moves:

```
open ──close──▶ pending_review ──approve──▶ approved   (locked)
                      ▲                │
                      └──── revise ────┴──reject──▶ rejected
```

Until an owner or manager approves it, **expenses and testing figures stay
editable** — the review panel has an Edit button, and the settlement table
recalculates live as figures change. Sending a shift back records a reason the
operator sees; correcting a rejected shift returns it to the queue. Approving
locks the record: `reviseShift` refuses to touch an approved shift, and the
status field is not client-writable at all, so sign-off can only happen through
the `reviewShift` function, which stamps who approved it and when.

### Nozzles are fixed, expenses are live

The nozzles an operator takes are settled when the shift starts and cannot
change afterwards — every litre on those meters belongs to that shift, with no
argument about who was holding what when.

Expenses work the other way round. Money paid out of the drawer is logged from
the open shift panel the moment it is spent, one line at a time, so nothing has
to be reconstructed from memory at handover. By the time the shift closes the
expenses are already in, which is what keeps closing short: meter readings, the
day's testing figures, and the cash count.

### Credit sales do not need an existing customer

Most credit at a forecourt is a known hauler, but plenty of it is a walk-in.
A credit line takes a name and phone number directly; picking from the customer
list is optional. On submission the phone number is matched against existing
accounts — a repeat customer posts to the account they already have, and an
unrecognised number opens a new one automatically. Either way the debt lands in
the credit ledger attached to a named account, so nothing is anonymous and
every balance can be chased.

### Prices are effective-dated

A price is not a single current value but an interval:
`effectiveFrom .. effectiveTo` (null while active). Setting a new price closes
the previous interval and opens a new one in one transaction, so history is
never overwritten and any past shift can be repriced with the figure that
genuinely applied when it ran.

`openShift` and `closeShift` are Cloud Functions rather than client writes,
because advancing meters and posting credit must be atomic — a partial write
would corrupt the next shift's opening readings.

## Project layout

```
src/
  lib/        firebase init, api facade, shift maths, formatters, demo backend
  state/      auth context, station loader
  components/ layout, ledger entry form, shared UI primitives
  pages/      login, developer admin, owner dashboard, shifts, pump/rate
              setup, daily ledger, credit, staff
functions/    createOwner, createStaff, addStation, deleteStation, resetPin,
              pinLogin, setPrice, openShift, closeShift, addShiftExpense,
              removeShiftExpense, reviseShift, reviewShift
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

stations/{stationId}/pumps/{pumpId}        name, createdAt
stations/{stationId}/nozzles/{nozzleId}    pumpId, name, fuelType,
                                           lastReading, createdAt
stations/{stationId}/prices/{priceId}      fuelType, price, effectiveFrom,
                                           effectiveTo, setBy, setByName

shifts/{stationId}/records/{shiftId}
  employeeName, userId, date,
  status: 'open'|'pending_review'|'approved'|'rejected',
  startTime, endTime, openedByName, closedByName,
  approvedBy, approvedByName, approvedAt,
  rejectedBy, rejectedByName, rejectedAt, rejectionReason,
  revisedBy, revisedByName, revisedAt,
  nozzles: [ { nozzleId, pumpId, label, fuelType,
               openingReading, closingReading, price, priceId } ],
  expenses:    [ { label, amount, at } ],   logged live during the shift
  creditSales: [ { customerId, name, phone, amount } ],
  payments:    { cash, card, upi, credit, other },
  testing:     { MS, HSD },          rupee value test-dispensed today
  note

creditCustomers/{stationId}/customers/{customerId}
  name, phone, outstandingBalance, createdAt, createdFromShift,
  transactions: [ { date, type: 'credit'|'payment', amount, note } ]
```

Nothing financial is stored that can be computed. Litres, sale amounts,
expected cash and variance are all derived from the readings above, so a
figure can never drift out of agreement with the meter it came from.

## Security posture

- `users`, `usernames`, `authSecrets`, `stations` accept **no client writes**.
  All account and station creation flows through Cloud Functions, where the
  Admin SDK bypasses rules.
- `authSecrets`, `usernames` and `loginAttempts` are fully closed to clients
  in both directions.
- Station access is resolved by a rules helper matching the station's
  `ownerId` against the caller's `ownerId` claim (owners span many stations)
  or the caller's `stationId` claim (single-station staff).
- Shift documents accept **no client writes whatsoever**. Every mutation —
  open, close, log an expense, revise, approve, reject — goes through a
  Cloud Function. That is what makes approval meaningful: a client cannot flip
  `status` to `approved`, so the sign-off stamp always names a real reviewer.
- `reviewShift` re-checks the caller's role server-side; only an owner or
  manager can approve or reject, and `reviseShift` refuses an approved shift.
- `deleteStation` is owner-only, verifies ownership of the specific station,
  refuses while a shift is open, and cascades through pumps, nozzles, prices,
  shift records and the credit ledger. The UI additionally requires the owner
  to type the station's exact name, because it is unrecoverable.
- Pumps and nozzles are readable by station staff but writable only by the
  owner, so an attendant cannot edit a meter. Prices are written solely by the
  `setPrice` function, which enforces owner-only and keeps the interval chain
  gap-free.
- Every shift records who opened it and who closed it, with timestamps.
- `createStaff` re-checks server-side that the target station belongs to the
  calling owner before creating anything.
- `resetPin` re-derives the caller's authority from their token and the
  target's `ownerId`, so hiding a button is never what keeps an account safe.
- PINs never appear in Firestore, in function logs, or in any error message —
  failed logins return a deliberately vague "Incorrect username or PIN."
