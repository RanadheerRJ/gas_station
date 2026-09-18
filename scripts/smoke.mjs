// Headless smoke test of the demo backend + ledger maths (no browser needed).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { demoBackend: be } = await import("../src/lib/demoBackend.js");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

console.log("\nauth");
let threw = false;
try {
  await be.pinLogin({ username: "ravikumar", pin: "0000" });
} catch {
  threw = true;
}
ok("wrong PIN rejected", threw);
const owner = await be.pinLogin({ username: "ravikumar", pin: "2468" });
ok("owner logs in with correct PIN", owner.role === "owner");
const att = await be.pinLogin({ username: "maheshn", pin: "9753" });
ok("attendant logs in", att.role === "attendant" && att.stationIds.length === 1);

console.log("\nstations");
const ownerStations = await be.listStations(owner);
ok("owner sees both stations", ownerStations.length === 2, `got ${ownerStations.length}`);
const attStations = await be.listStations(att);
ok("attendant sees only their station", attStations.length === 1);

console.log("\nprovisioning");
const created = await be.createOwner({
  ownerName: "Ravi Kumar",
  stationName: "Second Pump",
  phone: "1",
  address: "x",
  pin: "5731",
});
ok(
  "username de-duplicated on collision",
  created.username === "ravikumar2",
  `got ${created.username}`
);
ok("chosen PIN is not echoed back", created.pin === undefined);
ok(
  "chosen PIN works for login",
  (await be.pinLogin({ username: "ravikumar2", pin: "5731" })).role === "owner"
);

for (const bad of ["1234", "0000", "4321", "12", "abcd", "12345"]) {
  let rejected = false;
  try {
    await be.createOwner({
      ownerName: "Weak " + bad,
      stationName: "s",
      phone: "1",
      address: "x",
      pin: bad,
    });
  } catch {
    rejected = true;
  }
  ok(`weak/invalid PIN "${bad}" rejected`, rejected);
}

const staff = await be.createStaff(
  {
    name: "New Hand",
    phone: "2",
    stationId: ownerStations[0].id,
    role: "attendant",
    pin: "8264",
  },
  owner
);
ok("owner can create staff on own station", staff.username === "newhand");
ok(
  "staff signs in with owner-chosen PIN",
  (await be.pinLogin({ username: "newhand", pin: "8264" })).role === "attendant"
);
let denied = false;
try {
  await be.createStaff(
    { name: "X", phone: "3", stationId: created.stationId, role: "manager", pin: "8264" },
    owner
  );
} catch {
  denied = true;
}
ok("owner blocked from another owner's station", denied);

console.log("\nPIN resets (RBAC)");
const newHand = (await be.listStaff(owner)).find((u) => u.username === "newhand");
await be.resetPin({ uid: newHand.uid, pin: "3917" }, owner);
ok(
  "owner resets own staff PIN",
  (await be.pinLogin({ username: "newhand", pin: "3917" })).uid === newHand.uid
);
let oldWorks = false;
try {
  await be.pinLogin({ username: "newhand", pin: "8264" });
  oldWorks = true;
} catch {
  /* expected */
}
ok("old PIN stops working after reset", !oldWorks);

const admin = await be.pinLogin({ username: "developer", pin: "4820" });
const ownerRec = (await be.listOwners()).find((o) => o.username === "ravikumar");
await be.resetPin({ uid: ownerRec.uid, pin: "7412" }, admin);
ok(
  "developer resets an owner's PIN",
  (await be.pinLogin({ username: "ravikumar", pin: "7412" })).role === "owner"
);

let upward = false;
try {
  await be.resetPin({ uid: ownerRec.uid, pin: "5555" }, newHand);
} catch {
  upward = true;
}
ok("staff cannot reset upward", upward);

const otherOwner = (await be.listOwners()).find((o) => o.username === "ravikumar2");
let sideways = false;
try {
  await be.resetPin({ uid: otherOwner.uid, pin: "6183" }, ownerRec);
} catch {
  sideways = true;
}
ok("owner cannot reset a peer owner", sideways);

let weakReset = false;
try {
  await be.resetPin({ uid: newHand.uid, pin: "1111" }, owner);
} catch {
  weakReset = true;
}
ok("weak PIN rejected on reset too", weakReset);

console.log("\nshift maths");
const sm = await import("../src/lib/shiftMath.js");
const tm = await import("../src/lib/tankMath.js");
ok("litres = closing - opening", sm.litresBetween(1000, 1250.5) === 250.5);
ok(
  "meter rollover handled",
  sm.litresBetween(999900, 100) === 200,
  String(sm.litresBetween(999900, 100))
);
{
  const t = sm.shiftTotals({
    nozzles: [
      {
        nozzleId: "a",
        openingReading: 1000,
        closingReading: 1100,
        price: 100,
        fuelType: "Petrol",
        label: "P1 N1",
      },
      {
        nozzleId: "b",
        openingReading: 500,
        closingReading: 600,
        price: 90,
        fuelType: "Diesel",
        label: "P1 N2",
      },
    ],
    expenses: [{ amount: 500 }],
    payments: { cash: 12500, card: 1000, upi: 3000, credit: 2000, other: 0 },
  });
  // gross 19000, net 18500, collected 18500
  ok("gross from meters", t.gross === 19000, String(t.gross));
  ok("net is gross less expenses", t.net === 18500, String(t.net));
  ok(
    "litres rolled up per fuel",
    t.fuels.Petrol.litres === 100 && t.fuels.Diesel.litres === 100
  );
  ok("payments summed across modes", t.declared === 18500, String(t.declared));
  ok("balanced variance is zero", t.variance === 0);
  ok("balanced reads as balanced", sm.varianceLabel(t.variance) === "balanced");
}
{
  const short = sm.shiftTotals({
    nozzles: [
      {
        nozzleId: "a",
        openingReading: 0,
        closingReading: 100,
        price: 100,
        fuelType: "Petrol",
      },
    ],
    payments: { cash: 9500 },
  });
  ok(
    "short drawer detected",
    short.variance === -500 && sm.varianceLabel(short.variance) === "short"
  );
  ok("short is flagged negative", sm.varianceTone(short.variance) === "neg");
}
ok(
  "closing below opening rejected",
  sm.validateClosing([{ label: "P1", openingReading: 500, closingReading: 400 }])
    .length === 1
);
ok(
  "missing closing rejected",
  sm.validateClosing([{ label: "P1", openingReading: 500, closingReading: "" }])
    .length === 1
);
ok(
  "good closing passes",
  sm.validateClosing([{ label: "P1", openingReading: 500, closingReading: 620 }])
    .length === 0
);

console.log("\neffective-dated prices");
{
  const recs = [
    {
      fuelType: "Petrol",
      price: 100,
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveTo: "2026-02-01T00:00:00Z",
    },
    {
      fuelType: "Petrol",
      price: 110,
      effectiveFrom: "2026-02-01T00:00:00Z",
      effectiveTo: null,
    },
    {
      fuelType: "Diesel",
      price: 90,
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveTo: null,
    },
  ];
  ok(
    "price in force mid-interval",
    sm.priceAtTime(recs, "Petrol", "2026-01-15T00:00:00Z").price === 100
  );
  ok(
    "price after change",
    sm.priceAtTime(recs, "Petrol", "2026-03-01T00:00:00Z").price === 110
  );
  const act = sm.activePrices(recs);
  ok(
    "active price map picks open interval",
    act.Petrol.price === 110 && act.Diesel.price === 90
  );
}

console.log("\npump occupancy");
{
  const pumps = [{ id: "p1" }, { id: "p2" }];
  const nz = [
    { id: "n1", pumpId: "p1" },
    { id: "n2", pumpId: "p1" },
    { id: "n3", pumpId: "p2" },
  ];
  const openShifts = [
    { id: "s1", employeeName: "Mahesh", nozzles: [{ nozzleId: "n1" }] },
  ];
  const occ = sm.pumpOccupancy(pumps, nz, openShifts);
  ok("pump with a held nozzle is busy", occ.p1.busy === true);
  ok("busy pump names the operator", occ.p1.operators[0] === "Mahesh");
  ok("untouched pump stays free", occ.p2.busy === false);
}

console.log("\nshift lifecycle (per-nozzle)");
{
  const st = ownerStations[0].id;
  const eq = await be.listPumps(st);
  ok(
    "station seeded with pumps and nozzles",
    eq.pumps.length === 2 && eq.nozzles.length === 4
  );

  const p1Nozzles = eq.nozzles.filter((n) => n.pumpId === eq.pumps[0].id);
  const p2Nozzles = eq.nozzles.filter((n) => n.pumpId === eq.pumps[1].id);

  const shiftA = await be.openShift(st, { nozzleIds: p1Nozzles.map((n) => n.id) }, owner);
  ok("shift takes only the chosen nozzles", shiftA.nozzles.length === p1Nozzles.length);
  ok(
    "opening reading taken from nozzle meter",
    shiftA.nozzles[0].openingReading === p1Nozzles[0].lastReading
  );
  ok("price snapshotted onto each nozzle", shiftA.nozzles[0].price > 0);

  // The headline of the reference model: a second operator works another pump.
  const staffProfile = (await be.listStaff(owner)).find((u) => u.role === "attendant");
  const shiftB = await be.openShift(
    st,
    { nozzleIds: p2Nozzles.map((n) => n.id) },
    staffProfile
  );
  ok("a second shift runs concurrently on another pump", shiftB.status === "open");

  let clash = false;
  try {
    await be.openShift(st, { nozzleIds: [p1Nozzles[0].id] }, staffProfile);
  } catch {
    clash = true;
  }
  ok("a nozzle already in a shift cannot be taken", clash);

  const openNow = (await be.listShifts(st)).filter((x) => x.status === "open");
  ok("both shifts are open at once", openNow.length === 2);

  const occ = sm.pumpOccupancy(eq.pumps, eq.nozzles, openNow);
  ok("both pumps read as busy", occ[eq.pumps[0].id].busy && occ[eq.pumps[1].id].busy);

  await be.closeShift(
    st,
    shiftA.id,
    {
      closingReadings: Object.fromEntries(
        shiftA.nozzles.map((n) => [n.nozzleId, n.openingReading + 100])
      ),
      expenses: [],
      creditSales: [],
      payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
    },
    owner
  );

  const eqAfter = await be.listPumps(st);
  const advanced = eqAfter.nozzles.find((n) => n.id === p1Nozzles[0].id);
  ok(
    "closed shift advances only its own nozzles",
    advanced.lastReading === p1Nozzles[0].lastReading + 100
  );
  const untouched = eqAfter.nozzles.find((n) => n.id === p2Nozzles[0].id);
  ok(
    "the other shift's nozzles are untouched",
    untouched.lastReading === p2Nozzles[0].lastReading
  );

  const next = await be.openShift(st, { nozzleIds: [p1Nozzles[0].id] }, owner);
  ok(
    "next shift opens where the last closed",
    next.nozzles[0].openingReading === advanced.lastReading
  );
}

console.log("\nprice intervals & credit posting");
{
  const st = ownerStations[1].id;
  await be.setPrice(st, { fuelType: "Petrol", price: 111.11 }, owner);
  const prices = await be.getPrices(st);
  const act = sm.activePrices(prices);
  ok("new price becomes active", act.Petrol.price === 111.11);
  const closedOld = prices.filter((p) => p.fuelType === "Petrol" && p.effectiveTo);
  ok("previous price interval was closed", closedOld.length >= 1);
  ok("price change records who set it", act.Petrol.setByName === owner.name);

  const custs = await be.listCustomers(st);
  const target = custs[0];
  const eq2 = await be.listPumps(st);
  const sh = await be.openShift(st, { nozzleIds: [eq2.nozzles[0].id] }, owner);
  ok("shift uses the newly set price", sh.nozzles[0].price === 111.11);

  const beforeBal = target.outstandingBalance;
  await be.closeShift(
    st,
    sh.id,
    {
      closingReadings: { [sh.nozzles[0].nozzleId]: sh.nozzles[0].openingReading + 10 },
      expenses: [],
      creditSales: [{ customerId: target.id, name: target.name, amount: 5000 }],
      payments: { cash: 0, card: 0, upi: 0, credit: 5000, other: 0 },
    },
    owner
  );
  const after = (await be.listCustomers(st)).find((c) => c.id === target.id);
  ok(
    "credit sale posts to customer account",
    after.outstandingBalance === beforeBal + 5000,
    `${beforeBal} -> ${after.outstandingBalance}`
  );
}

console.log("\ncredit");
const sid = ownerStations[0].id;
const cust = await be.createCustomer(sid, { name: "Test Hauliers", phone: "9" });
ok("customer starts at zero", cust.outstandingBalance === 0);
await be.addCustomerTransaction(sid, cust.id, {
  date: "2020-01-01",
  type: "credit",
  amount: 5000,
  note: "",
});
const afterPay = await be.addCustomerTransaction(sid, cust.id, {
  date: "2020-01-02",
  type: "payment",
  amount: 2000,
  note: "",
});
ok(
  "balance = credit - payments",
  afterPay.outstandingBalance === 3000,
  String(afterPay.outstandingBalance)
);

// The callable returns a receipt, so read the account back for its history.
const reread = (await be.listCustomers(sid)).find((c) => c.id === cust.id);
ok("transactions appended", reread.transactions.length === 2);

// Guards mirroring recordCustomerPayment.
let overpaid = false;
try {
  await be.addCustomerTransaction(sid, cust.id, {
    date: "2020-01-03",
    type: "payment",
    amount: 99999,
    note: "",
  });
} catch {
  overpaid = true;
}
ok("cannot repay more than is owed", overpaid);
let zeroAmt = false;
try {
  await be.addCustomerTransaction(sid, cust.id, {
    date: "2020-01-03",
    type: "credit",
    amount: 0,
    note: "",
  });
} catch {
  zeroAmt = true;
}
ok("a zero-amount posting is rejected", zeroAmt);
let badType = false;
try {
  await be.addCustomerTransaction(sid, cust.id, {
    date: "2020-01-03",
    type: "refund",
    amount: 10,
    note: "",
  });
} catch {
  badType = true;
}
ok("an unknown transaction type is rejected", badType);
ok(
  "a rejected posting leaves the balance alone",
  (await be.listCustomers(sid)).find((c) => c.id === cust.id).outstandingBalance === 3000
);

/** Close any shift still open on a station so the next block starts clean. */
async function drainOpenShifts(stationId) {
  const open = (await be.listShifts(stationId)).filter((x) => x.status === "open");
  for (const sh of open) {
    await be.closeShift(
      stationId,
      sh.id,
      {
        closingReadings: Object.fromEntries(
          sh.nozzles.map((n) => [n.nozzleId, n.openingReading])
        ),
        expenses: [],
        creditSales: [],
        payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
      },
      owner
    );
  }
}

console.log("\ntesting deduction & handover maths");
{
  const t = sm.shiftTotals({
    nozzles: [
      {
        nozzleId: "n",
        fuelType: "Petrol",
        openingReading: 0,
        closingReading: 100,
        price: 100,
      },
    ],
    testing: { MS: 500, HSD: 200 },
    expenses: [{ label: "Tea", amount: 300 }],
    payments: { cash: 6000, card: 1000, upi: 1500, credit: 500, other: 0 },
  });
  ok("gross from meters", t.gross === 10000, String(t.gross));
  ok("testing split kept per product", t.testingMS === 500 && t.testingHSD === 200);
  ok("testing total summed", t.testingTotal === 700);
  ok("net = gross - testing - expenses", t.net === 9000, String(t.net));
  ok("non-cash excludes cash", t.nonCash === 3000, String(t.nonCash));
  ok("handover = net - non-cash", t.handover === 6000, String(t.handover));
  ok("variance = collected - net", t.variance === 0, String(t.variance));

  const short = sm.shiftTotals({
    nozzles: [
      {
        nozzleId: "n",
        fuelType: "Diesel",
        openingReading: 0,
        closingReading: 10,
        price: 100,
      },
    ],
    testing: { MS: 0, HSD: 100 },
    payments: { cash: 800, card: 0, upi: 0, credit: 0, other: 0 },
  });
  ok("short collection reads negative", short.variance === -100, String(short.variance));
  ok(
    "missing testing defaults to zero",
    sm.shiftTotals({ nozzles: [] }).testingTotal === 0
  );
  ok(
    "litres grouped MS/HSD",
    sm.litresByGroup([
      { fuelType: "Petrol", litresSold: 10 },
      { fuelType: "Premium Petrol", litresSold: 5 },
      { fuelType: "Diesel", litresSold: 20 },
    ]).MS === 15
  );
  ok("classifyFuel maps diesel to HSD", sm.classifyFuel("Diesel") === "HSD");
}

console.log("\nnozzles are fixed once a shift starts");
{
  const st = ownerStations[0].id;
  await drainOpenShifts(st);
  const eq = await be.listPumps(st);
  const spare = eq.nozzles;

  const sh = await be.openShift(st, { nozzleIds: [spare[0].id] }, owner);
  ok("shift starts with the chosen nozzles", sh.nozzles.length === 1);
  ok("no way to drop a nozzle mid-shift", be.removeNozzleFromShift === undefined);
  ok("no way to add a nozzle mid-shift", be.addNozzleToShift === undefined);

  await be.closeShift(
    st,
    sh.id,
    {
      closingReadings: { [spare[0].id]: spare[0].lastReading + 5 },
      creditSales: [],
      payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
    },
    owner
  );
}

console.log("\nexpenses logged during the shift");
{
  const st = ownerStations[0].id;
  await drainOpenShifts(st);
  const eq = await be.listPumps(st);
  const nz = eq.nozzles[0];

  const sh = await be.openShift(st, { nozzleIds: [nz.id] }, owner);
  ok("a new shift starts with no expenses", (sh.expenses || []).length === 0);

  const one = await be.addShiftExpense(st, sh.id, { label: "Tea", amount: 120 });
  ok("expense logged while the shift runs", one.expenses.length === 1);
  ok("expense keeps its description", one.expenses[0].label === "Tea");
  ok("expense is timestamped", !!one.expenses[0].at);

  const two = await be.addShiftExpense(st, sh.id, { label: "Air filter", amount: 340 });
  ok("expenses accumulate", two.expenses.length === 2);

  let blank = false;
  try {
    await be.addShiftExpense(st, sh.id, { label: "  ", amount: 50 });
  } catch {
    blank = true;
  }
  ok("an expense needs a description", blank);
  let zero = false;
  try {
    await be.addShiftExpense(st, sh.id, { label: "Nothing", amount: 0 });
  } catch {
    zero = true;
  }
  ok("an expense needs a positive amount", zero);

  const pruned = await be.removeShiftExpense(st, sh.id, 0);
  ok("a mistaken expense can be removed", pruned.expenses.length === 1);
  ok("the right expense was removed", pruned.expenses[0].label === "Air filter");

  // Closing carries the logged expenses through without resending them.
  const closed = await be.closeShift(
    st,
    sh.id,
    {
      closingReadings: { [nz.id]: nz.lastReading + 100 },
      creditSales: [],
      testing: { MS: 0, HSD: 0 },
      payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
    },
    owner
  );
  ok("closing keeps the expenses logged during the shift", closed.expenses.length === 1);
  ok(
    "closing deducts them from net",
    sm.shiftTotals(closed).expensesTotal === 340,
    String(sm.shiftTotals(closed).expensesTotal)
  );

  let late = false;
  try {
    await be.addShiftExpense(st, sh.id, { label: "Too late", amount: 10 });
  } catch {
    late = true;
  }
  ok("a closed shift takes no more expenses", late);
}

console.log("\nreview workflow");
{
  const st = ownerStations[1].id;
  await drainOpenShifts(st);
  const eq = await be.listPumps(st);
  const spare = eq.nozzles;

  const sh = await be.openShift(st, { nozzleIds: [spare[0].id] }, owner);
  await be.addShiftExpense(st, sh.id, { label: "Air pump repair", amount: 400 });
  const closed = await be.closeShift(
    st,
    sh.id,
    {
      closingReadings: { [spare[0].id]: spare[0].lastReading + 100 },
      creditSales: [],
      testing: { MS: 250, HSD: 150 },
      payments: { cash: 1000, card: 0, upi: 0, credit: 0, other: 0 },
    },
    owner
  );
  ok("closing submits for review", closed.status === "pending_review", closed.status);
  ok("testing amounts stored", closed.testing.MS === 250 && closed.testing.HSD === 150);

  const revised = await be.reviseShift(
    st,
    sh.id,
    {
      expenses: [
        { label: "Air pump repair", amount: 400 },
        { label: "Rags", amount: 60 },
      ],
      testing: { MS: 300, HSD: 150 },
    },
    owner
  );
  ok("expenses editable before approval", revised.expenses.length === 2);
  ok("testing editable before approval", revised.testing.MS === 300);

  const sentBack = await be.rejectShift(st, sh.id, "Cash count is short", owner);
  ok("owner can send a shift back", sentBack.status === "rejected");
  ok("rejection reason recorded", sentBack.rejectionReason === "Cash count is short");

  const fixed = await be.reviseShift(
    st,
    sh.id,
    { payments: { cash: 1400, card: 0, upi: 0, credit: 0, other: 0 } },
    owner
  );
  ok("a corrected shift returns to the queue", fixed.status === "pending_review");

  const approved = await be.approveShift(st, sh.id, owner);
  ok("owner approves the shift", approved.status === "approved");
  ok("approver recorded", !!approved.approvedByName && !!approved.approvedAt);

  let locked = false;
  try {
    await be.reviseShift(st, sh.id, { expenses: [] }, owner);
  } catch {
    locked = true;
  }
  ok("an approved shift is locked", locked);
}

console.log("\nwalk-in credit customers");
{
  const st = ownerStations[1].id;
  await drainOpenShifts(st);
  const eq = await be.listPumps(st);
  const spare = eq.nozzles;
  const before = (await be.listCustomers(st)).length;

  const sh = await be.openShift(st, { nozzleIds: [spare[0].id] }, owner);
  await be.closeShift(
    st,
    sh.id,
    {
      closingReadings: { [spare[0].id]: spare[0].lastReading + 50 },
      expenses: [],
      creditSales: [{ name: "Anil Transport", phone: "9876500011", amount: 2500 }],
      payments: { cash: 0, card: 0, upi: 0, credit: 2500, other: 0 },
    },
    owner
  );

  const after = await be.listCustomers(st);
  ok("unknown payer is registered as a customer", after.length === before + 1);
  const created = after.find((c) => c.phone === "9876500011");
  ok("walk-in keeps their name", created?.name === "Anil Transport");
  ok(
    "walk-in debt posts to the new account",
    created?.outstandingBalance === 2500,
    String(created?.outstandingBalance)
  );

  // Same phone next time should reuse the account rather than duplicate it.
  const sh2 = await be.openShift(st, { nozzleIds: [spare[0].id] }, owner);
  const nz2 = sh2.nozzles[0];
  await be.closeShift(
    st,
    sh2.id,
    {
      closingReadings: { [nz2.nozzleId]: nz2.openingReading + 50 },
      expenses: [],
      creditSales: [{ name: "Anil Transport", phone: "9876500011", amount: 1500 }],
      payments: { cash: 0, card: 0, upi: 0, credit: 1500, other: 0 },
    },
    owner
  );
  const after2 = await be.listCustomers(st);
  ok("repeat walk-in does not duplicate the account", after2.length === before + 1);
  const grown = after2.find((c) => c.phone === "9876500011");
  ok(
    "repeat credit adds to the same balance",
    grown.outstandingBalance === 4000,
    String(grown.outstandingBalance)
  );
}

console.log("\nreversible lifecycle: no destructive actions");
{
  const fresh = await be.createOwner({
    ownerName: "Delete Me",
    stationName: "Doomed Pump",
    phone: "9",
    address: "x",
    pin: "7429",
  });
  const prof = await be.pinLogin({ username: fresh.username, pin: "7429" });
  const mine = await be.listStations(prof);
  ok("new owner has one station", mine.length === 1);

  ok("there is no way to delete a station", be.deleteStation === undefined);
  ok("there is no way to delete a pump", be.removePump === undefined);
  ok("there is no way to delete a nozzle", be.removeNozzle === undefined);

  const eq = await be.listPumps(mine[0].id);
  if (eq.nozzles.length) {
    const sh = await be.openShift(mine[0].id, { nozzleIds: [eq.nozzles[0].id] }, prof);
    let blocked = false;
    try {
      await be.setStationState(mine[0].id, "archived", prof);
    } catch {
      blocked = true;
    }
    ok("cannot archive a station with an open shift", blocked);
    await be.closeShift(
      mine[0].id,
      sh.id,
      {
        closingReadings: { [eq.nozzles[0].id]: eq.nozzles[0].lastReading },
        creditSales: [],
        payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
      },
      prof
    );
  }

  let notMine = false;
  try {
    await be.setStationState(mine[0].id, "archived", owner);
  } catch {
    notMine = true;
  }
  ok("another owner cannot archive the station", notMine);

  const archived = await be.setStationState(mine[0].id, "archived", prof);
  ok("station archives", archived.state === "archived");
  ok(
    "an archived station is still there, not deleted",
    (await be.listStations(prof)).length === 1
  );
  const back = await be.setStationState(mine[0].id, "active", prof);
  ok("an archived station reopens", back.state === "active");

  // Archiving must not bury money still owed to the station.
  const custs = await be.listCustomers(mine[0].id);
  if (custs.length === 0) {
    const c = await be.createCustomer(mine[0].id, { name: "Owes Money", phone: "555" });
    await be.addCustomerTransaction(mine[0].id, c.id, {
      date: "2020-01-01",
      type: "credit",
      amount: 900,
      note: "",
    });
    let owing = false;
    try {
      await be.setStationState(mine[0].id, "archived", prof);
    } catch {
      owing = true;
    }
    ok("cannot archive with credit outstanding", owing);
    await be.addCustomerTransaction(mine[0].id, c.id, {
      date: "2020-01-02",
      type: "payment",
      amount: 900,
      note: "",
    });
    const settled = await be.setStationState(mine[0].id, "archived", prof);
    ok("archives once the debt is settled", settled.state === "archived");
  }

  // Pumps and nozzles retire and return the same way.
  const st2 = ownerStations[0].id;
  const eq2 = await be.listPumps(st2);
  const nz = eq2.nozzles.find((n) => n.pumpId === eq2.pumps[1].id);
  const offNz = await be.setNozzleState(st2, nz.id, "retired");
  ok("a nozzle can be taken out of service", offNz.state === "retired");
  ok(
    "the nozzle is kept, not deleted",
    (await be.listPumps(st2)).nozzles.some((x) => x.id === nz.id)
  );
  const onNz = await be.setNozzleState(st2, nz.id, "active");
  ok("a nozzle returns to service", onNz.state === "active");

  const offPump = await be.setPumpState(st2, eq2.pumps[1].id, "retired");
  ok("a pump can be taken out of service", offPump.state === "retired");
  ok(
    "its nozzles follow it out",
    (await be.listPumps(st2)).nozzles
      .filter((x) => x.pumpId === eq2.pumps[1].id)
      .every((x) => x.state === "retired")
  );
  await be.setPumpState(st2, eq2.pumps[1].id, "active");
  ok(
    "and follow it back",
    (await be.listPumps(st2)).nozzles
      .filter((x) => x.pumpId === eq2.pumps[1].id)
      .every((x) => x.state === "active")
  );
}

console.log("\ntank maths");
{
  const t = {
    capacity: 20000,
    currentStock: 12500,
    fuelType: "Petrol",
    temperatureC: 32,
  };
  const st = tm.tankStatus(t);
  ok("fill percent from capacity", st.fillPercent === 62.5, String(st.fillPercent));
  ok("ullage is the room left", st.ullage === 7500, String(st.ullage));
  ok("a half-full tank reads ok", st.level === "ok");

  ok(
    "a fifth-full tank reads low",
    tm.tankStatus({ ...t, currentStock: 3000 }).level === "low"
  );
  ok(
    "nearly empty reads critical",
    tm.tankStatus({ ...t, currentStock: 800 }).level === "critical"
  );
  ok(
    "a retired tank is flagged",
    tm.tankStatus({ ...t, state: "retired" }).retired === true
  );
  ok("an empty capacity never divides by zero", tm.fillPercent(100, 0) === 0);

  // Warm fuel occupies more space, so correcting to 15 C must shrink it.
  const warm = tm.volumeAt15(10000, 35, "Petrol");
  ok("warm petrol corrects down", warm < 10000 && warm > 9700, String(warm));
  const cold = tm.volumeAt15(10000, 5, "Petrol");
  ok("cold petrol corrects up", cold > 10000, String(cold));
  ok(
    "fuel at the reference temperature is unchanged",
    tm.volumeAt15(10000, 15, "Diesel") === 10000
  );
  ok(
    "petrol swings more than diesel for the same heat",
    Math.abs(10000 - tm.volumeAt15(10000, 35, "Petrol")) >
      Math.abs(10000 - tm.volumeAt15(10000, 35, "Diesel"))
  );
  ok("no temperature means no correction", tm.volumeAt15(10000, "", "Petrol") === null);

  ok("petrol groups as MS", tm.tankGroup("Premium Petrol") === "MS");
  ok("diesel groups as HSD", tm.tankGroup("Diesel") === "HSD");
}

console.log("\ndip validation");
{
  const tank = { capacity: 20000, fuelType: "Diesel" };
  ok(
    "a good dip passes",
    tm.validateDip({ stockLitres: 9000, temperatureC: 30, waterCm: 0.5 }, tank).length ===
      0
  );
  ok(
    "missing stock is caught",
    tm.validateDip({ stockLitres: "", temperatureC: 30 }, tank).length > 0
  );
  ok(
    "missing temperature is caught",
    tm.validateDip({ stockLitres: 9000, temperatureC: "" }, tank).length > 0
  );
  ok(
    "stock beyond capacity is caught",
    tm.validateDip({ stockLitres: 25000, temperatureC: 30 }, tank).length > 0
  );
  ok(
    "negative stock is caught",
    tm.validateDip({ stockLitres: -5, temperatureC: 30 }, tank).length > 0
  );
  ok(
    "an implausible probe reading is caught",
    tm.validateDip({ stockLitres: 9000, temperatureC: 95 }, tank).length > 0
  );
  ok(
    "a freezing reading is caught",
    tm.validateDip({ stockLitres: 9000, temperatureC: -4 }, tank).length > 0
  );
}

console.log("\nstock reconciliation");
{
  const r = tm.reconcileTank({
    openingStock: 15000,
    delivered: 5000,
    soldLitres: 7500,
    closingStock: 12480,
  });
  ok("book stock = opening + delivered - sold", r.book === 12500, String(r.book));
  ok("variance is actual less book", r.variance === -20, String(r.variance));
  ok("a small loss is within tolerance", r.withinTolerance);

  const leak = tm.reconcileTank({
    openingStock: 15000,
    delivered: 0,
    soldLitres: 5000,
    closingStock: 9800,
  });
  ok(
    "a 200 L shortfall breaches tolerance",
    leak.withinTolerance === false,
    String(leak.variancePercent)
  );

  const sold = tm.litresSoldSince(
    [
      {
        status: "approved",
        endTime: new Date(Date.now() - 3600000).toISOString(),
        nozzles: [{ fuelType: "Diesel", openingReading: 100, closingReading: 400 }],
      },
      {
        status: "approved",
        endTime: new Date(Date.now() - 3600000).toISOString(),
        nozzles: [{ fuelType: "Petrol", openingReading: 100, closingReading: 900 }],
      },
      {
        status: "open",
        endTime: null,
        nozzles: [{ fuelType: "Diesel", openingReading: 0, closingReading: 999 }],
      },
    ],
    "Diesel",
    new Date(Date.now() - 86400000).toISOString()
  );
  ok("only the matching product is counted", sold === 300, String(sold));
}

console.log("\ntanks & ground stock");
{
  const st = ownerStations[0].id;
  const { tanks: seeded } = await be.listTanks(st);
  ok("station seeded with tanks", seeded.length === 3, `got ${seeded.length}`);

  const made = await be.addTank(st, {
    name: "Tank 4",
    fuelType: "Petrol",
    capacity: 10000,
    currentStock: 4000,
  });
  ok("owner adds a tank", made.capacity === 10000);
  ok("a new tank has no temperature yet", made.temperatureC === null);

  let noCap = false;
  try {
    await be.addTank(st, { name: "Bad", fuelType: "Petrol", capacity: 0 });
  } catch {
    noCap = true;
  }
  ok("a tank needs a capacity", noCap);
  let overFull = false;
  try {
    await be.addTank(st, {
      name: "Bad",
      fuelType: "Petrol",
      capacity: 1000,
      currentStock: 5000,
    });
  } catch {
    overFull = true;
  }
  ok("opening stock cannot exceed capacity", overFull);

  // A dip replaces the stock figure and stamps the temperature.
  const { tank: dipped, dip } = await be.recordDip(
    st,
    made.id,
    {
      stockLitres: 3600,
      temperatureC: 31.4,
      waterCm: 0.3,
      note: "Evening dip",
    },
    owner
  );
  ok("dip sets the tank stock", dipped.currentStock === 3600);
  ok("dip records the temperature", dipped.temperatureC === 31.4);
  ok("dip records who took it", dip.recordedByName === owner.name);
  ok("dip keeps the previous figure", dip.previousStock === 4000);
  ok("dip computes the change", dip.change === -400, String(dip.change));
  ok("dip is timestamped", !!dip.recordedAt);

  let hotProbe = false;
  try {
    await be.recordDip(st, made.id, { stockLitres: 3000, temperatureC: 90 }, owner);
  } catch {
    hotProbe = true;
  }
  ok("an implausible temperature is rejected", hotProbe);
  let noTemp = false;
  try {
    await be.recordDip(st, made.id, { stockLitres: 3000, temperatureC: "" }, owner);
  } catch {
    noTemp = true;
  }
  ok("a dip without temperature is rejected", noTemp);
  let tooMuch = false;
  try {
    await be.recordDip(st, made.id, { stockLitres: 99999, temperatureC: 30 }, owner);
  } catch {
    tooMuch = true;
  }
  ok("a dip beyond capacity is rejected", tooMuch);

  // Deliveries add to stock and must respect ullage.
  const { tank: filled } = await be.recordDelivery(
    st,
    made.id,
    {
      litres: 5000,
      temperatureC: 33,
      invoice: "TL-1",
    },
    owner
  );
  ok("delivery adds to stock", filled.currentStock === 8600, String(filled.currentStock));

  let overfill = false;
  try {
    await be.recordDelivery(st, made.id, { litres: 9000, temperatureC: 33 }, owner);
  } catch {
    overfill = true;
  }
  ok("a delivery that would overfill is refused", overfill);

  const { dips } = await be.listTanks(st);
  ok(
    "readings are logged newest first",
    new Date(dips[0].recordedAt) >= new Date(dips[1].recordedAt)
  );
  ok(
    "the delivery is in the log",
    dips.some((x) => x.kind === "delivery")
  );

  ok("there is no way to delete a tank", be.removeTank === undefined);

  // Retiring is reversible and never destroys the dip history.
  let stillWet = false;
  try {
    await be.setTankState(st, made.id, "retired", owner);
  } catch {
    stillWet = true;
  }
  ok("a tank with stock cannot be retired", stillWet);

  await be.recordDip(st, made.id, { stockLitres: 0, temperatureC: 30 }, owner);
  const retired = await be.setTankState(st, made.id, "retired", owner);
  ok("an empty tank can be retired", retired.state === "retired");
  ok("retiring records who did it", !!retired.stateChangedBy);

  const afterRetire = await be.listTanks(st);
  ok(
    "a retired tank is kept, not deleted",
    afterRetire.tanks.some((x) => x.id === made.id)
  );
  ok(
    "its dip history survives",
    afterRetire.dips.some((x) => x.tankId === made.id)
  );

  let dipRetired = false;
  try {
    await be.recordDip(st, made.id, { stockLitres: 100, temperatureC: 30 }, owner);
  } catch {
    dipRetired = true;
  }
  ok("a retired tank cannot be dipped", dipRetired);

  const revived = await be.setTankState(st, made.id, "active", owner);
  ok("a retired tank can be brought back", revived.state === "active");
  await be.recordDip(st, made.id, { stockLitres: 500, temperatureC: 30 }, owner);
  ok(
    "and dipped again once back",
    (await be.listTanks(st)).tanks.find((x) => x.id === made.id).currentStock === 500
  );

  // Correcting a setup typo must not require rebuilding the tank.
  const renamed = await be.updateTank(st, made.id, { name: "Tank 4A", capacity: 12000 });
  ok("a tank can be renamed", renamed.name === "Tank 4A");
  ok("capacity can be corrected", renamed.capacity === 12000);
  let shrink = false;
  try {
    await be.updateTank(st, made.id, { capacity: 100 });
  } catch {
    shrink = true;
  }
  ok("capacity cannot drop below current stock", shrink);

  const rollup = tm.stockByProduct(
    (await be.listTanks(st)).tanks.filter((x) => x.state !== "retired")
  );
  ok(
    "stock rolls up per product",
    rollup.Diesel.tanks === 2,
    JSON.stringify(rollup.Diesel)
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
