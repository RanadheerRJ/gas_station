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

### Ground stock and temperature

Nozzle meters say what was sold; the tanks say what is actually in the ground.
The two are independent measurements of the same thing, which is what makes
them worth comparing — a persistent gap is how a leaking tank, an unbooked
delivery or a lying meter announces itself.

An owner sets up each tank once with its name, product and capacity. Every tank
is drawn as a cylinder filled to its actual level, with a bright line at the
fuel surface and quarter-height ticks like a sight glass. The level animates
from empty on first paint and eases between values as dips come in, so a change
in stock is something you watch happen rather than something you have to spot.
A tank under a quarter full turns amber; under a tenth, rust, with a reorder
notice above the farm.

**Temperature is recorded with every dip, and is not optional.** Petroleum
expands as it warms, so the same fuel reads as more litres at 34 °C than at
15 °C. Without the thermometer reading, two dips of the same tank are not
comparable and neither can be checked against a delivery invoice — which is
quoted at 15 °C. Each dip therefore stores its temperature, and the page shows
both the observed volume and its equivalent at 15 °C:

```
volume at 15 °C = observed × (1 − α × (T − 15))
α = 0.0012 per °C for MS (petrol), 0.00084 for HSD (diesel)
```

This is a linear approximation of the ASTM D1250 correction. It is deliberately
not the full table lookup, which needs the product's density at 15 °C — a
figure a forecourt does not measure at every dip. Across the 5–55 °C band a
station actually sees, the approximation is well within a tenth of a percent.

Readings are **append-only**. A wrong dip is not edited; it is superseded by
taking another one, exactly as a paper dip book works. Each reading keeps the
previous stock figure alongside the new one, so any change can be reconstructed
long afterwards. Deliveries are booked the same way and are refused outright if
the quantity would exceed the tank's ullage. Water depth is captured too, since
water in the bottom of a tank corrodes it and dilutes the next delivery; above
2.5 cm the page raises it.

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
  lib/        firebase init, api facade, shift maths, tank maths, formatters,
              demo backend
  state/      auth context, station loader
  components/ layout, ledger entry form, shared UI primitives
  pages/      login, developer admin, owner dashboard, shifts, pump/rate
              setup, ground stock, daily ledger, credit, staff
  components/motion.jsx   counting figures, one-shot cues, animated lists,
                          skeletons
functions/    createOwner, createStaff, addStation, setStationState, resetPin,
              pinLogin, setPrice, setPumpState, openShift, closeShift,
              addShiftExpense, removeShiftExpense, reviseShift, reviewShift,
              addTank, updateTank, setTankState, recordDip, recordDelivery,
              recordCustomerPayment
scripts/      setAdminClaim.js (one-off), smoke.mjs (logic tests)
src/lib/*.test.js         unit tests for the shift and tank maths
firestore.rules
firestore.indexes.json
```

## From a fresh clone to a running station

Nothing here assumes you were told anything in person. Follow it top to bottom
and you end up with a working deployment and one account that can create all
the others.

### 0. Prerequisites

- **Node 20.** The Cloud Functions runtime is pinned to Node 20 in
  `functions/package.json`; building the front end on a much newer major is
  fine, but deploying functions on a mismatched runtime is not.
- **A Firebase project on the Blaze plan.** Cloud Functions v2 will not deploy
  on Spark. There is no way around this — every account-creation and
  money-writing path in this app is a callable function.
- **`firebase-tools`**, installed below.

### 1. Run it with no backend at all

Before touching Firebase, confirm the app works:

```bash
npm install
npm run dev          # http://localhost:5173
```

With no `.env.local` present the app runs entirely in `localStorage`, seeded
with two stations, several days of shifts, tanks and credit customers. The
sign-in screen lists the demo logins and their PINs. Click through all four
roles here first; it costs nothing and makes the rest of this obvious.

### 2. Create the Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com).
2. **Build → Authentication → Get started**, and enable the
   **Email/Password** provider. This is used by exactly one account, the
   developer. Everyone else signs in with a username and PIN against a custom
   token, which needs no provider enabled.
3. **Build → Firestore Database → Create database**. Start in **production
   mode** — the rules in this repo replace the defaults in step 4. Pick the
   region closest to the stations; it cannot be changed later.
4. **Project settings → General → Your apps → Web app** (`</>`). Register the
   app and copy the config object.

### 3. Point the app at the project

```bash
cp .env.example .env.local
```

Fill in each value from the config object you just copied:

| Variable | Where it comes from | Required |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` | yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` | yes |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` | yes |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` | yes |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | yes |
| `VITE_FIREBASE_APP_ID` | `appId` | yes |
| `VITE_FUNCTIONS_REGION` | region you deploy functions to | no, defaults to `us-central1` |

The app switches out of demo mode as soon as `VITE_FIREBASE_PROJECT_ID` is
set, so fill in all of them or none of them. `.env.local` is git-ignored and
must stay that way — these values are public-by-design client config, but the
file is a habit worth keeping clean.

If you deploy functions somewhere other than `us-central1`, set
`VITE_FUNCTIONS_REGION` to match or every callable will fail with a CORS-ish
`internal` error that tells you nothing.

### 4. Deploy rules, indexes and functions

```bash
npm i -g firebase-tools
firebase login
firebase use --add          # select the project, give it the alias "default"

cd functions && npm install && cd ..

firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

Deploy the rules **before** anyone signs in. A database left in production-mode
defaults denies everything, and one left in test-mode defaults allows the
world to read your ledgers.

The first functions deploy also enables the required Google Cloud APIs and
takes several minutes. If it fails asking you to enable Cloud Build or
Artifact Registry, accept and run it again.

### 5. Create the developer account

The developer is the only account the app cannot create, because there is
nobody yet to create it. It is made by hand, once.

1. **Authentication → Users → Add user.** Give it an email and a password.
   This account signs in with email and password, not a PIN.
2. **Project settings → Service accounts → Generate new private key.** Save
   the downloaded file as `serviceAccountKey.json` in the repo root. It is
   git-ignored. Treat it as a root password: it bypasses every security rule
   in this repo. Delete it when you are done.
3. Grant the claim:

   ```bash
   cd functions && npm install && cd ..   # the script uses firebase-admin
   node scripts/setAdminClaim.js you@example.com
   ```

   The script looks the user up by email and sets `{ admin: true }`. It prints
   the uid it changed. It never touches a PIN.

4. **Sign out and back in.** Custom claims are baked into the ID token at
   issue time, so an existing session will not see the new claim.

You can do the same thing without the script from any Admin SDK context:
`admin.auth().setCustomUserClaims(uid, { admin: true })`.

### 6. Work down the chain

Sign in as the developer. From there the app creates everyone else, and each
level can only create the level below it:

1. **Developer → Invite Owner.** The only screen a developer sees. Creates an
   owner with a username and a PIN you choose and tell them.
2. **Owner → Stations.** Add the station or stations.
3. **Owner → Staff.** Create managers and attendants, each bound to one
   station.
4. **Owner → Setup.** Add pumps, nozzles and tanks, and set opening prices.
   Shifts cannot be opened until a nozzle has a price.

At no point does anyone sign themselves up, and at no point is a PIN generated
for you — whoever creates an account chooses the PIN and is responsible for
passing it on.

### Verifying a deployment

```bash
npm run check
```

That runs lint, the unit tests, the smoke suite and a production build. The
smoke suite exercises the demo backend rather than your Firebase project, so
it is safe to run against a live checkout.

## Running locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production bundle into dist/
npm run preview      # serve the built bundle, needed to test the service worker
```

The service worker only registers in a production build, so PWA behaviour must
be checked through `npm run preview`, not `npm run dev`.

### Checks

```bash
npm run lint         # ESLint across src/, functions/ and scripts/
npm run format       # Prettier, same config for the app and the functions
npm test             # unit tests for the shift and tank maths
npm run smoke        # end-to-end pass over the demo backend
npm run check        # all of the above, then a build
```

`npm test` covers `src/lib/shiftMath.js` and `src/lib/tankMath.js` — the pure
money and volume arithmetic, with no Firebase in the way. `npm run smoke`
drives the demo backend through real sequences: opening and closing shifts,
approval and rejection, credit repayment limits, and the archive and restore
guards.

## Query and index audit

Firestore fails a query that has no index, and a **composite** index is only
required when a query has two or more equality filters, or mixes a filter with
an `orderBy` on a different field. Single-field equality and a lone `orderBy`
are served automatically. A missing index does not fail at deploy time; it
fails the first time that exact query runs, which may be months later.

Every query in `src/lib/api.js` and `functions/index.js` was enumerated. Only
one needs a composite index:

| Query | Where | Index |
| --- | --- | --- |
| `prices.where(fuelType ==).where(effectiveTo == null)` | `setPrice` | **required**, in `firestore.indexes.json` |
| `stations.where(ownerId ==)` | `listStations` | automatic |
| `users.where(role ==)`, `users.where(ownerId ==)` | staff lists | automatic |
| `prices.orderBy(effectiveFrom desc)` | `getPrices` | automatic |
| `shifts/*/records.orderBy(startTime desc)` | `listShifts` | automatic |
| `tanks.orderBy(createdAt)` | `listTanks` | automatic |
| `tankReadings.orderBy(recordedAt desc)` | `listTankReadings` | automatic |
| `shifts.where(status == "open")` | `openShift` guard | automatic |
| `customers.where(phone ==).limit(1)` | `closeShift` credit lookup | automatic |
| `nozzles.where(pumpId ==)` | pump retire cascade | automatic |
| `customers.where(outstandingBalance > 0)` | station archive guard | automatic |

A single range filter on one field is also automatic, which covers the
outstanding-balance guard.

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
stations/{stationId}/tanks/{tankId}        name, fuelType, capacity,
                                           currentStock, state, temperatureC,
                                           waterCm, lastDipAt, lastDipBy,
                                           createdAt

tankReadings/{stationId}/readings/{readingId}   append-only dip log
  tankId, kind: 'dip'|'delivery', stockLitres, previousStock, change,
  temperatureC, waterCm, invoice, note,
  recordedBy, recordedByName, recordedAt

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

## Every door swings both ways

Nothing in this app deletes anything. Real money and fuel stock are at stake,
and a single mis-tap on a phone at a forecourt must never be able to destroy a
year of shift records or a customer's outstanding balance.

Plant is **retired**, not removed, and can always be brought back:

| Thing | Reversible action | Guard before it happens |
| --- | --- | --- |
| Station | archive ⇄ reopen | no open shift, no credit outstanding |
| Tank | out of service ⇄ return | must be drawn down to empty first |
| Pump | out of service ⇄ return | not in an open shift; nozzles follow it |
| Nozzle | out of service ⇄ return | not in an open shift |
| Shift | reject ⇄ resubmit | only before approval |

Retired items keep their history and stay readable in reports; they simply
drop out of the day-to-day screens. A tank's dips survive it being taken out
of service, and a nozzle's meter readings survive it being retired — every
shift that ever cited them still resolves.

Corrections work the same way. A tank's name, product and capacity can all be
fixed after setup, because a typo at 6am should not be permanent; the only
constraint is that capacity cannot be set below the stock already in the tank.
Dips are the one genuine append-only log: a wrong reading is superseded by
taking another, never edited, exactly as a paper dip book works.

## Installing as an app

The frontend is a progressive web app. On a phone or tablet it installs to the
home screen and runs full-screen with no browser chrome, which is how a
forecourt actually uses it.

- `public/manifest.webmanifest` — standalone display, portrait, graphite theme,
  with a maskable icon so Android's circular mask does not crop the mark.
- `public/sw.js` — caches the app shell so the interface boots without a
  signal. **Data is never cached:** every Firestore, Cloud Functions and auth
  request is forced to the network, because a stale fuel price or stock level
  is worse than an honest error — someone would act on it.
- The service worker is registered only in production builds; caching a shell
  while editing source is a debugging trap.
- A rust banner appears the moment the connection drops, stating plainly that
  saves will fail until it returns. Chrome's install prompt is captured and
  offered as a bar, and a dismissal is remembered.

Below 860px the sidebar becomes a fixed bottom tab bar with safe-area insets
respected, touch targets are raised to 40px, and inputs use 16px type so iOS
does not zoom the viewport on focus.

## Motion

Movement explains a change; it never decorates one. The vocabulary is an
instrument panel rather than a marketing site: short, linear, nothing
overshoots or bounces.

Every duration and curve is a custom property in `styles.css`, so the whole
app is retuned in one place:

| Token | Value | Used for |
| --- | --- | --- |
| `--duration-instant` | 90ms | button press |
| `--duration-fast` | 140ms | hover and colour changes |
| `--duration-base` | 180ms | list rows entering and leaving |
| `--duration-slow` | 220ms | status changes, input rejection |
| `--duration-page` | 260ms | route transitions, counting figures |
| `--duration-fill` | 760ms | a tank level finding its new height |
| `--ease-out` | entering and responding | |
| `--ease-in` | leaving | |

What actually animates, and why:

- **Figures count** rather than snap, on dashboard totals, tank stock,
  outstanding balances and the handover panel, and tick green or rust for one
  beat in the direction they moved. A figure that jumps gives no clue whether
  it went up or down.
- **Shift status** flips with a brief mark on the badge as a shift moves
  between pending review, approved and sent back.
- **Inputs knock sideways** once when a PIN or amount is rejected, and settle
  green when a PIN pair matches. A static red line is easy to miss.
- **Rows slide in and collapse out** for expenses, credit customers and tanks,
  so the rows below travel rather than jump.
- **Routes cross-fade** in 260ms.
- **Loading is a skeleton** in paper tones — the shape of the panel that is
  coming — not a grey shimmer or the word "Loading".
- **Install and offline bars** ease in, and the "back online" note eases itself
  out after a couple of seconds instead of vanishing.

Under `prefers-reduced-motion: reduce` every duration collapses and all
translation is removed outright, in JS as well as CSS: counting is driven by a
timer, and a media query cannot stop a timer. Nothing is conveyed by movement
alone — every state that animates also has colour and text.

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
- **There are no destructive operations anywhere in the app** — see below.
- Tanks accept no client writes. Stock moves only through `recordDip` and
  `recordDelivery`, which validate against capacity and ullage and write the
  reading and the new level in one transaction — so stock can never shift
  without a dated reading behind it. Dip history is append-only in both the
  rules and the UI.
- Adding or removing a tank is owner-only and re-checks station ownership
  server-side; a tank still holding sellable stock cannot be removed.
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
