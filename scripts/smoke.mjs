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
    readings: {
      a: { opening: 1000, closing: 1100, rate: 100, fuelType: "Petrol", label: "P1 N1" },
      b: { opening: 500, closing: 600, rate: 90, fuelType: "Diesel", label: "P1 N2" },
    },
    creditSales: [{ amount: 2000 }],
    expenses: [{ amount: 500 }],
    digitalCollected: 1000,
    cashDeclared: 15500,
  });
  // 100*100 + 100*90 = 19000; expected = 19000-2000-1000-500 = 15500
  ok("gross from meters", t.grossSales === 19000, String(t.grossSales));
  ok("litres rolled up per fuel", t.fuels.Petrol.litres === 100 && t.fuels.Diesel.litres === 100);
  ok("expected cash", t.expectedCash === 15500, String(t.expectedCash));
  ok("balanced variance is zero", t.variance === 0);
  ok("balanced reads as balanced", sm.varianceLabel(t.variance) === "balanced");
}
{
  const short = sm.shiftTotals({
    readings: { a: { opening: 0, closing: 100, rate: 100, fuelType: "Petrol" } },
    cashDeclared: 9500,
  });
  ok("short drawer detected", short.variance === -500 && sm.varianceLabel(short.variance) === "short");
  ok("short is flagged negative", sm.varianceTone(short.variance) === "neg");
}
ok("closing below opening rejected",
   sm.validateClosing({ a: { label: "P1", opening: 500, closing: 400 } }).length === 1);
ok("missing closing rejected",
   sm.validateClosing({ a: { label: "P1", opening: 500, closing: "" } }).length === 1);
ok("good closing passes",
   sm.validateClosing({ a: { label: "P1", opening: 500, closing: 620 } }).length === 0);

console.log("\nshift lifecycle");
{
  const st = ownerStations[0].id;
  const eq = await be.listPumps(st);
  ok("station seeded with pumps and nozzles", eq.pumps.length === 2 && eq.nozzles.length === 4);

  const before = await be.listShifts(st);
  const openedShift = await be.openShift(st, { name: "Test" }, owner);
  ok("shift opens with snapshotted readings",
     Object.keys(openedShift.readings).length === 4 && openedShift.status === "open");
  const firstNozzle = eq.nozzles[0];
  ok("opening reading taken from nozzle totaliser",
     openedShift.readings[firstNozzle.id].opening === firstNozzle.currentReading);
  ok("rate snapshotted onto shift", openedShift.readings[firstNozzle.id].rate > 0);

  let dup = false;
  try { await be.openShift(st, { name: "Second" }, owner); } catch { dup = true; }
  ok("cannot open two shifts at once", dup);

  const closings = {};
  Object.entries(openedShift.readings).forEach(([id, r]) => {
    closings[id] = { closing: r.opening + 100 };
  });
  const closed = await be.closeShift(st, openedShift.id, {
    readings: closings, expenses: [], creditSales: [], digitalCollected: 0, cashDeclared: 0,
  }, owner);
  ok("shift closes", closed.status === "closed" && closed.closedByName === owner.name);

  const eqAfter = await be.listPumps(st);
  const advanced = eqAfter.nozzles.find((n) => n.id === firstNozzle.id);
  ok("nozzle totaliser advanced to closing",
     advanced.currentReading === firstNozzle.currentReading + 100,
     `${advanced.currentReading}`);

  const next = await be.openShift(st, { name: "Next" }, owner);
  ok("next shift opens where the last closed",
     next.readings[firstNozzle.id].opening === advanced.currentReading);
  await be.closeShift(st, next.id, {
    readings: Object.fromEntries(Object.entries(next.readings).map(([id, r]) => [id, { closing: r.opening }])),
    expenses: [], creditSales: [], digitalCollected: 0, cashDeclared: 0,
  }, owner);

  ok("closed shifts accumulate", (await be.listShifts(st)).length >= before.length + 2);
}

console.log("\nrates & credit posting");
{
  const st = ownerStations[1].id;
  await be.setRate(st, { fuelType: "Petrol", rate: 111.11 }, owner);
  const r = await be.getRates(st);
  ok("rate updated", r.rates.Petrol === 111.11);
  ok("rate change recorded in history", r.history[0].rate === 111.11 && !!r.history[0].setByName);

  const custs = await be.listCustomers(st);
  const target = custs[0];
  const openedShift = await be.openShift(st, { name: "Credit test" }, owner);
  const beforeBal = target.outstandingBalance;
  await be.closeShift(st, openedShift.id, {
    readings: Object.fromEntries(
      Object.entries(openedShift.readings).map(([id, rr]) => [id, { closing: rr.opening + 10 }])
    ),
    expenses: [],
    creditSales: [{ customerId: target.id, name: target.name, amount: 5000 }],
    digitalCollected: 0,
    cashDeclared: 0,
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
