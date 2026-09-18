// Headless smoke test of the demo backend + ledger maths (no browser needed).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { demoBackend: be } = await import("../src/lib/demoBackend.js");
const fmt = await import("../src/lib/format.js");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log("\nauth");
let threw = false;
try { await be.pinLogin({ username: "ravikumar", pin: "0000" }); } catch { threw = true; }
ok("wrong PIN rejected", threw);
const owner = await be.pinLogin({ username: "ravikumar", pin: "2468" });
ok("owner logs in with correct PIN", owner.role === "owner");
const att = (await be.pinLogin({ username: "maheshn", pin: "9753" }));
ok("attendant logs in", att.role === "attendant" && att.stationIds.length === 1);

console.log("\nstations");
const ownerStations = await be.listStations(owner);
ok("owner sees both stations", ownerStations.length === 2, `got ${ownerStations.length}`);
const attStations = await be.listStations(att);
ok("attendant sees only their station", attStations.length === 1);

console.log("\nprovisioning");
const created = await be.createOwner({ ownerName: "Ravi Kumar", stationName: "Second Pump", phone: "1", address: "x", pin: "5731" });
ok("username de-duplicated on collision", created.username === "ravikumar2", `got ${created.username}`);
ok("chosen PIN is not echoed back", created.pin === undefined);
ok("chosen PIN works for login", (await be.pinLogin({ username: "ravikumar2", pin: "5731" })).role === "owner");

for (const bad of ["1234", "0000", "4321", "12", "abcd", "12345"]) {
  let rejected = false;
  try { await be.createOwner({ ownerName: "Weak " + bad, stationName: "s", phone: "1", address: "x", pin: bad }); }
  catch { rejected = true; }
  ok(`weak/invalid PIN "${bad}" rejected`, rejected);
}

const staff = await be.createStaff({ name: "New Hand", phone: "2", stationId: ownerStations[0].id, role: "attendant", pin: "8264" }, owner);
ok("owner can create staff on own station", staff.username === "newhand");
ok("staff signs in with owner-chosen PIN", (await be.pinLogin({ username: "newhand", pin: "8264" })).role === "attendant");
let denied = false;
try { await be.createStaff({ name: "X", phone: "3", stationId: created.stationId, role: "manager", pin: "8264" }, owner); }
catch { denied = true; }
ok("owner blocked from another owner's station", denied);

console.log("\nPIN resets (RBAC)");
const newHand = (await be.listStaff(owner)).find((u) => u.username === "newhand");
await be.resetPin({ uid: newHand.uid, pin: "3917" }, owner);
ok("owner resets own staff PIN", (await be.pinLogin({ username: "newhand", pin: "3917" })).uid === newHand.uid);
let oldWorks = false;
try { await be.pinLogin({ username: "newhand", pin: "8264" }); oldWorks = true; } catch {}
ok("old PIN stops working after reset", !oldWorks);

const admin = await be.pinLogin({ username: "developer", pin: "4820" });
const ownerRec = (await be.listOwners()).find((o) => o.username === "ravikumar");
await be.resetPin({ uid: ownerRec.uid, pin: "7412" }, admin);
ok("developer resets an owner's PIN", (await be.pinLogin({ username: "ravikumar", pin: "7412" })).role === "owner");

let upward = false;
try { await be.resetPin({ uid: ownerRec.uid, pin: "5555" }, newHand); } catch { upward = true; }
ok("staff cannot reset upward", upward);

const otherOwner = (await be.listOwners()).find((o) => o.username === "ravikumar2");
let sideways = false;
try { await be.resetPin({ uid: otherOwner.uid, pin: "6183" }, ownerRec); } catch { sideways = true; }
ok("owner cannot reset a peer owner", sideways);

let weakReset = false;
try { await be.resetPin({ uid: newHand.uid, pin: "1111" }, owner); } catch { weakReset = true; }
ok("weak PIN rejected on reset too", weakReset);

console.log("\nshift maths");
const sm = await import("../src/lib/shiftMath.js");
ok("litres = closing - opening", sm.litresBetween(1000, 1250.5) === 250.5);
ok("meter rollover handled", sm.litresBetween(999900, 100) === 200, String(sm.litresBetween(999900, 100)));
{
  const t = sm.shiftTotals({
    nozzles: [
      { nozzleId: "a", openingReading: 1000, closingReading: 1100, price: 100, fuelType: "Petrol", label: "P1 N1" },
      { nozzleId: "b", openingReading: 500, closingReading: 600, price: 90, fuelType: "Diesel", label: "P1 N2" },
    ],
    expenses: [{ amount: 500 }],
    payments: { cash: 12500, card: 1000, upi: 3000, credit: 2000, other: 0 },
  });
  // gross 19000, net 18500, collected 18500
  ok("gross from meters", t.gross === 19000, String(t.gross));
  ok("net is gross less expenses", t.net === 18500, String(t.net));
  ok("litres rolled up per fuel", t.fuels.Petrol.litres === 100 && t.fuels.Diesel.litres === 100);
  ok("payments summed across modes", t.declared === 18500, String(t.declared));
  ok("balanced variance is zero", t.variance === 0);
  ok("balanced reads as balanced", sm.varianceLabel(t.variance) === "balanced");
}
{
  const short = sm.shiftTotals({
    nozzles: [{ nozzleId: "a", openingReading: 0, closingReading: 100, price: 100, fuelType: "Petrol" }],
    payments: { cash: 9500 },
  });
  ok("short drawer detected", short.variance === -500 && sm.varianceLabel(short.variance) === "short");
  ok("short is flagged negative", sm.varianceTone(short.variance) === "neg");
}
ok("closing below opening rejected",
   sm.validateClosing([{ label: "P1", openingReading: 500, closingReading: 400 }]).length === 1);
ok("missing closing rejected",
   sm.validateClosing([{ label: "P1", openingReading: 500, closingReading: "" }]).length === 1);
ok("good closing passes",
   sm.validateClosing([{ label: "P1", openingReading: 500, closingReading: 620 }]).length === 0);

console.log("\neffective-dated prices");
{
  const recs = [
    { fuelType: "Petrol", price: 100, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: "2026-02-01T00:00:00Z" },
    { fuelType: "Petrol", price: 110, effectiveFrom: "2026-02-01T00:00:00Z", effectiveTo: null },
    { fuelType: "Diesel", price: 90, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null },
  ];
  ok("price in force mid-interval", sm.priceAtTime(recs, "Petrol", "2026-01-15T00:00:00Z").price === 100);
  ok("price after change", sm.priceAtTime(recs, "Petrol", "2026-03-01T00:00:00Z").price === 110);
  const act = sm.activePrices(recs);
  ok("active price map picks open interval", act.Petrol.price === 110 && act.Diesel.price === 90);
}

console.log("\npump occupancy");
{
  const pumps = [{ id: "p1" }, { id: "p2" }];
  const nz = [
    { id: "n1", pumpId: "p1" }, { id: "n2", pumpId: "p1" },
    { id: "n3", pumpId: "p2" },
  ];
  const openShifts = [{ id: "s1", employeeName: "Mahesh", nozzles: [{ nozzleId: "n1" }] }];
  const occ = sm.pumpOccupancy(pumps, nz, openShifts);
  ok("pump with a held nozzle is busy", occ.p1.busy === true);
  ok("busy pump names the operator", occ.p1.operators[0] === "Mahesh");
  ok("untouched pump stays free", occ.p2.busy === false);
}

console.log("\nshift lifecycle (per-nozzle)");
{
  const st = ownerStations[0].id;
  const eq = await be.listPumps(st);
  ok("station seeded with pumps and nozzles", eq.pumps.length === 2 && eq.nozzles.length === 4);

  const p1Nozzles = eq.nozzles.filter((n) => n.pumpId === eq.pumps[0].id);
  const p2Nozzles = eq.nozzles.filter((n) => n.pumpId === eq.pumps[1].id);

  const shiftA = await be.openShift(st, { nozzleIds: p1Nozzles.map((n) => n.id) }, owner);
  ok("shift takes only the chosen nozzles", shiftA.nozzles.length === p1Nozzles.length);
  ok("opening reading taken from nozzle meter",
     shiftA.nozzles[0].openingReading === p1Nozzles[0].lastReading);
  ok("price snapshotted onto each nozzle", shiftA.nozzles[0].price > 0);

  // The headline of the reference model: a second operator works another pump.
  const staffProfile = (await be.listStaff(owner)).find((u) => u.role === "attendant");
  const shiftB = await be.openShift(st, { nozzleIds: p2Nozzles.map((n) => n.id) }, staffProfile);
  ok("a second shift runs concurrently on another pump", shiftB.status === "open");

  let clash = false;
  try { await be.openShift(st, { nozzleIds: [p1Nozzles[0].id] }, staffProfile); } catch { clash = true; }
  ok("a nozzle already in a shift cannot be taken", clash);

  const openNow = (await be.listShifts(st)).filter((x) => x.status === "open");
  ok("both shifts are open at once", openNow.length === 2);

  const occ = sm.pumpOccupancy(eq.pumps, eq.nozzles, openNow);
  ok("both pumps read as busy", occ[eq.pumps[0].id].busy && occ[eq.pumps[1].id].busy);

  await be.closeShift(st, shiftA.id, {
    closingReadings: Object.fromEntries(
      shiftA.nozzles.map((n) => [n.nozzleId, n.openingReading + 100])
    ),
    expenses: [], creditSales: [],
    payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
  }, owner);

  const eqAfter = await be.listPumps(st);
  const advanced = eqAfter.nozzles.find((n) => n.id === p1Nozzles[0].id);
  ok("closed shift advances only its own nozzles",
     advanced.lastReading === p1Nozzles[0].lastReading + 100);
  const untouched = eqAfter.nozzles.find((n) => n.id === p2Nozzles[0].id);
  ok("the other shift's nozzles are untouched",
     untouched.lastReading === p2Nozzles[0].lastReading);

  const next = await be.openShift(st, { nozzleIds: [p1Nozzles[0].id] }, owner);
  ok("next shift opens where the last closed",
     next.nozzles[0].openingReading === advanced.lastReading);
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
  await be.closeShift(st, sh.id, {
    closingReadings: { [sh.nozzles[0].nozzleId]: sh.nozzles[0].openingReading + 10 },
    expenses: [],
    creditSales: [{ customerId: target.id, name: target.name, amount: 5000 }],
    payments: { cash: 0, card: 0, upi: 0, credit: 5000, other: 0 },
  }, owner);
  const after = (await be.listCustomers(st)).find((c) => c.id === target.id);
  ok("credit sale posts to customer account", after.outstandingBalance === beforeBal + 5000,
     `${beforeBal} -> ${after.outstandingBalance}`);
}

console.log("\ncredit");
const sid = ownerStations[0].id;
const cust = await be.createCustomer(sid, { name: "Test Hauliers", phone: "9" });
ok("customer starts at zero", cust.outstandingBalance === 0);
await be.addCustomerTransaction(sid, cust.id, { date: "2020-01-01", type: "credit", amount: 5000, note: "" });
const afterPay = await be.addCustomerTransaction(sid, cust.id, { date: "2020-01-02", type: "payment", amount: 2000, note: "" });
ok("balance = credit - payments", afterPay.outstandingBalance === 3000, String(afterPay.outstandingBalance));
ok("transactions appended", afterPay.transactions.length === 2);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
