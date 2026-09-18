/**
 * End-to-end tests against the Firebase emulator suite.
 *
 * These replace the old demo-backend smoke tests. The difference matters: the
 * demo backend was a second implementation of the rules, so it could only ever
 * confirm that the imitation agreed with itself. This drives the real Cloud
 * Functions and the real firestore.rules, so it catches the things that
 * actually break in production — a transaction that reads after a write, a
 * rule that denies a legitimate read, a callable that trusts client input.
 *
 * Run it with:
 *
 *   npm run test:emulator
 *
 * which starts the emulators, runs this file, and shuts them down. The
 * emulators need a Java runtime; see the README.
 *
 * Nothing here touches a real project: the Firestore and Auth emulator host
 * variables are set before the Admin SDK initialises, and the project id is
 * the demo- prefixed one the emulator reserves for offline use.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-station-ledger";
const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const FUNCTIONS_ORIGIN = process.env.FUNCTIONS_ORIGIN || "http://127.0.0.1:5001";

const admin = await import("firebase-admin");
const app = admin.default.initializeApp({ projectId: PROJECT_ID });
const db = admin.default.firestore();
const auth = admin.default.auth();

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function throws(name, fn, matching) {
  try {
    await fn();
    ok(name, false, "(expected a rejection, got success)");
  } catch (err) {
    const msg = String(err?.message || err);
    ok(name, matching ? msg.toLowerCase().includes(matching.toLowerCase()) : true, msg);
  }
}

/**
 * Calls a deployed callable over HTTP the way the browser SDK does.
 *
 * The Admin SDK cannot invoke callables, and the client SDK needs a browser
 * environment, so the wire format is constructed directly: a bearer ID token
 * and a { data } envelope. The emulator verifies the token exactly as
 * production does, so auth and claims are genuinely exercised.
 */
async function callAs(idToken, name, data = {}) {
  const res = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/${REGION}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (body?.error) {
    const err = new Error(body.error.message || "callable failed");
    err.code = body.error.status;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return body?.result;
}

/**
 * Mints an ID token for a uid with the given claims.
 *
 * The Auth emulator accepts a custom token exchange over its REST endpoint,
 * which is how a real client turns the pinLogin result into a session.
 */
async function idTokenFor(uid, claims = {}) {
  await auth.createUser({ uid }).catch(() => {});
  if (Object.keys(claims).length) await auth.setCustomUserClaims(uid, claims);
  const customToken = await auth.createCustomToken(uid, claims);
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(`token exchange failed: ${JSON.stringify(body)}`);
  return body.idToken;
}

/** Clears Firestore between runs so results do not depend on history. */
async function wipe() {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`could not clear Firestore: HTTP ${res.status}`);
}

/* ------------------------------------------------------------------ */

await wipe();

console.log("\nbootstrap");

const adminToken = await idTokenFor("dev-admin", { admin: true });
ok("developer gets an admin token", Boolean(adminToken));

const owner = await callAs(adminToken, "createOwner", {
  ownerName: "Ravi Kumar",
  stationName: "Highway Fuels",
  phone: "9000000001",
  address: "NH-16, Vijayawada",
  pin: "4827",
});
ok("developer creates an owner and a station", Boolean(owner?.uid && owner?.stationId));
ok("createOwner returns a username", typeof owner?.username === "string");
ok("createOwner never returns the PIN", !JSON.stringify(owner).includes("4827"));

const stationId = owner.stationId;
const ownerToken = await idTokenFor(owner.uid, { role: "owner", ownerId: owner.uid });

console.log("\naccess control");

// assertAdmin reports a missing token as permission-denied rather than
// unauthenticated, so match on neither and just require a rejection.
await throws("a signed-out caller cannot create an owner", () =>
  callAs(null, "createOwner", { ownerName: "X" })
);

await throws(
  "an owner cannot create another owner",
  () =>
    callAs(ownerToken, "createOwner", {
      ownerName: "Impostor",
      stationName: "Nowhere",
      phone: "9",
      address: "-",
      pin: "3947",
    }),
  "permission"
);

const staff = await callAs(ownerToken, "createStaff", {
  name: "Suresh Babu",
  phone: "9000000002",
  stationId,
  role: "manager",
  pin: "5183",
});
ok("owner creates a manager", Boolean(staff?.uid));

const managerToken = await idTokenFor(staff.uid, {
  role: "manager",
  ownerId: owner.uid,
  stationId,
});

await throws(
  "a manager cannot create staff",
  () =>
    callAs(managerToken, "createStaff", {
      name: "Nope",
      phone: "9",
      stationId,
      role: "attendant",
      pin: "5417",
    }),
  "permission"
);

console.log("\nPIN handling");

await throws(
  "a weak PIN is refused",
  () =>
    callAs(ownerToken, "createStaff", {
      name: "Weak",
      phone: "9",
      stationId,
      role: "attendant",
      pin: "1234",
    }),
  "pin"
);

const secret = await db.collection("authSecrets").doc(staff.uid).get();
ok("a PIN hash is stored for the new account", secret.exists);
ok(
  "the stored PIN is hashed, not the digits",
  secret.exists && !JSON.stringify(secret.data()).includes("5183")
);

const login = await callAs(null, "pinLogin", {
  username: staff.username,
  pin: "5183",
});
ok("correct PIN returns a custom token", Boolean(login?.token));

await throws(
  "wrong PIN is rejected",
  () => callAs(null, "pinLogin", { username: staff.username, pin: "9999" }),
  ""
);

console.log("\nfirestore rules");

// The rules are what stand between a signed-in attendant and the ledger, so
// they are checked with a real client token rather than the Admin SDK, which
// bypasses rules entirely.
const rulesTesting = await import("@firebase/rules-unit-testing").catch(() => null);

if (!rulesTesting) {
  console.log("  skip  @firebase/rules-unit-testing not installed");
} else {
  const testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8080 },
  });

  const ownerCtx = testEnv.authenticatedContext(owner.uid, {
    role: "owner",
    ownerId: owner.uid,
  });
  const attendantCtx = testEnv.authenticatedContext("att-1", {
    role: "attendant",
    ownerId: owner.uid,
    stationId,
  });

  const { assertFails, assertSucceeds } = rulesTesting;

  await assertSucceeds(ownerCtx.firestore().collection("stations").doc(stationId).get())
    .then(() => ok("owner may read their own station", true))
    .catch((e) => ok("owner may read their own station", false, e.message));

  await assertFails(
    ownerCtx.firestore().collection("stations").doc(stationId).set({ name: "hacked" })
  )
    .then(() => ok("nobody may write a station from the client", true))
    .catch((e) => ok("nobody may write a station from the client", false, e.message));

  await assertFails(ownerCtx.firestore().collection("authSecrets").doc(staff.uid).get())
    .then(() => ok("PIN hashes are unreadable from the client", true))
    .catch((e) => ok("PIN hashes are unreadable from the client", false, e.message));

  await assertFails(
    attendantCtx
      .firestore()
      .collection("users")
      .doc("att-1")
      .set({ role: "owner" }, { merge: true })
  )
    .then(() => ok("an attendant cannot promote themselves", true))
    .catch((e) => ok("an attendant cannot promote themselves", false, e.message));

  // Credit balances are the money path: a client may create a customer at zero
  // but never move the balance, which is what recordCustomerPayment is for.
  const custRef = ownerCtx
    .firestore()
    .collection("creditCustomers")
    .doc(stationId)
    .collection("customers")
    .doc("c1");

  await assertSucceeds(
    custRef.set({
      name: "Lorry Co",
      phone: "9000000009",
      outstandingBalance: 0,
      transactions: [],
    })
  )
    .then(() => ok("a customer may be created at a zero balance", true))
    .catch((e) => ok("a customer may be created at a zero balance", false, e.message));

  await assertFails(custRef.update({ outstandingBalance: 50000 }))
    .then(() => ok("a client cannot write an outstanding balance", true))
    .catch((e) => ok("a client cannot write an outstanding balance", false, e.message));

  await testEnv.cleanup();
}

console.log("\ncredit money path");

const custId = "c1";
await db
  .collection("creditCustomers")
  .doc(stationId)
  .collection("customers")
  .doc(custId)
  .set({
    name: "Lorry Co",
    phone: "9000000009",
    outstandingBalance: 0,
    transactions: [],
  });

await callAs(managerToken, "recordCustomerPayment", {
  stationId,
  customerId: custId,
  type: "credit",
  amount: 5000,
  note: "diesel on credit",
  date: "2026-01-05",
});

let cust = await db
  .collection("creditCustomers")
  .doc(stationId)
  .collection("customers")
  .doc(custId)
  .get();
ok("a credit sale increases the balance", cust.data().outstandingBalance === 5000);
ok("the transaction is recorded", cust.data().transactions.length === 1);
ok(
  "the transaction records who entered it",
  Boolean(cust.data().transactions[0].recordedBy)
);

await callAs(managerToken, "recordCustomerPayment", {
  stationId,
  customerId: custId,
  type: "payment",
  amount: 2000,
  date: "2026-01-06",
});

cust = await db
  .collection("creditCustomers")
  .doc(stationId)
  .collection("customers")
  .doc(custId)
  .get();
ok("a repayment decreases the balance", cust.data().outstandingBalance === 3000);

await throws(
  "a repayment larger than the balance is refused",
  () =>
    callAs(managerToken, "recordCustomerPayment", {
      stationId,
      customerId: custId,
      type: "payment",
      amount: 999999,
      date: "2026-01-07",
    }),
  ""
);

await throws(
  "a zero amount is refused",
  () =>
    callAs(managerToken, "recordCustomerPayment", {
      stationId,
      customerId: custId,
      type: "credit",
      amount: 0,
      date: "2026-01-07",
    }),
  ""
);

cust = await db
  .collection("creditCustomers")
  .doc(stationId)
  .collection("customers")
  .doc(custId)
  .get();
ok(
  "a refused payment leaves the balance untouched",
  cust.data().outstandingBalance === 3000
);

console.log("\nequipment and shifts");

const pumpsRef = db.collection("stations").doc(stationId).collection("pumps");
const pump = pumpsRef.doc();
await pump.set({ name: "Pump 1", state: "active", createdAt: new Date() });

const nozzlesRef = db.collection("stations").doc(stationId).collection("nozzles");
const nozzle = nozzlesRef.doc();
await nozzle.set({
  pumpId: pump.id,
  label: "Pump 1 · N1",
  fuelType: "Diesel",
  lastReading: 1000,
  state: "active",
  createdAt: new Date(),
});

// setPrice stamps effectiveFrom itself; the client cannot backdate a price.
await callAs(ownerToken, "setPrice", { stationId, fuelType: "Diesel", price: 92.5 });

const prices = await db
  .collection("stations")
  .doc(stationId)
  .collection("prices")
  .where("fuelType", "==", "Diesel")
  .where("effectiveTo", "==", null)
  .get();
ok("setPrice opens exactly one live price interval", prices.size === 1);

await callAs(ownerToken, "setPrice", { stationId, fuelType: "Diesel", price: 93.1 });

await throws(
  "a manager cannot change prices",
  () => callAs(managerToken, "setPrice", { stationId, fuelType: "Diesel", price: 1 }),
  "owner"
);

await throws(
  "a price of zero is refused",
  () => callAs(ownerToken, "setPrice", { stationId, fuelType: "Diesel", price: 0 }),
  ""
);

const stillOpen = await db
  .collection("stations")
  .doc(stationId)
  .collection("prices")
  .where("fuelType", "==", "Diesel")
  .where("effectiveTo", "==", null)
  .get();
ok("a price change closes the previous interval", stillOpen.size === 1);

const opened = await callAs(managerToken, "openShift", {
  stationId,
  employeeName: "Suresh Babu",
  nozzleIds: [nozzle.id],
});
ok("a shift opens against a priced nozzle", Boolean(opened?.shiftId || opened?.id));

await throws(
  "the same nozzle cannot be opened twice",
  () =>
    callAs(managerToken, "openShift", {
      stationId,
      employeeName: "Someone Else",
      nozzleIds: [nozzle.id],
    }),
  ""
);

const tank = await callAs(ownerToken, "addTank", {
  stationId,
  name: "T1",
  fuelType: "Diesel",
  capacity: 20000,
  currentStock: 5000,
});
ok("owner adds a tank", Boolean(tank?.tankId));

await throws(
  "a tank holding fuel cannot be retired",
  () =>
    callAs(ownerToken, "setTankState", {
      stationId,
      tankId: tank.tankId,
      state: "retired",
    }),
  ""
);

// Emptying it first should make the same call succeed, which proves the guard
// is about the fuel and not about tanks in general.
await db
  .collection("stations")
  .doc(stationId)
  .collection("tanks")
  .doc(tank.tankId)
  .update({ currentStock: 0 });

await callAs(ownerToken, "setTankState", {
  stationId,
  tankId: tank.tankId,
  state: "retired",
});
const retired = await db
  .collection("stations")
  .doc(stationId)
  .collection("tanks")
  .doc(tank.tankId)
  .get();
ok("an empty tank can be retired", retired.get("state") === "retired");

await callAs(ownerToken, "setTankState", {
  stationId,
  tankId: tank.tankId,
  state: "active",
});
const restored = await db
  .collection("stations")
  .doc(stationId)
  .collection("tanks")
  .doc(tank.tankId)
  .get();
ok("a retired tank can be restored", restored.get("state") === "active");

/* ------------------------------------------------------------------ */

console.log(`\n${pass} passed, ${fail} failed\n`);
if (failures.length) {
  console.log("failed:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
await app.delete();
process.exit(fail ? 1 : 0);
