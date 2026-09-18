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
const created = await be.createOwner({ ownerName: "Ravi Kumar", stationName: "Second Pump", phone: "1", address: "x" });
ok("username de-duplicated on collision", created.username === "ravikumar2", `got ${created.username}`);
ok("PIN is 4 digits", /^\d{4}$/.test(created.pin), created.pin);
const staff = await be.createStaff({ name: "New Hand", phone: "2", stationId: ownerStations[0].id, role: "attendant" }, owner);
ok("owner can create staff on own station", staff.username === "newhand");
let denied = false;
try { await be.createStaff({ name: "X", phone: "3", stationId: created.stationId, role: "manager" }, owner); }
catch { denied = true; }
ok("owner blocked from another owner's station", denied);

console.log("\nledger");
const sid = ownerStations[0].id;
const before = await be.listEntries(sid);
await be.createEntry(sid, { date: "2020-01-01", enteredBy: owner.uid, enteredByName: owner.name,
  fuelSales: { Petrol: { litres: 100, ratePerLitre: 100, amount: 10000 } }, tankReadings: {},
  cashIn: 500, cashOut: 200, expenses: [{ label: "e", amount: 300 }], creditSales: [{ name: "c", amount: 1000 }] });
const after = await be.listEntries(sid);
ok("entry created", after.length === before.length + 1);
ok("entries sorted newest first", after[0].date >= after[after.length - 1].date);
const mine = after.find((e) => e.date === "2020-01-01");
ok("entry records who entered it", mine.enteredBy === owner.uid && !!mine.createdAt);
ok("sales total", fmt.entrySalesTotal(mine) === 10000);
// 10000 + 500 - 1000 - 300 - 200
ok("cash position maths", fmt.entryCashPosition(mine) === 9000, String(fmt.entryCashPosition(mine)));
await be.updateEntry(sid, mine.id, { cashIn: 900 });
const upd = (await be.listEntries(sid)).find((e) => e.id === mine.id);
ok("entry updated", upd.cashIn === 900 && !!upd.updatedAt);
await be.deleteEntry(sid, mine.id);
ok("entry deleted", !(await be.listEntries(sid)).some((e) => e.id === mine.id));

console.log("\ncredit");
const cust = await be.createCustomer(sid, { name: "Test Hauliers", phone: "9" });
ok("customer starts at zero", cust.outstandingBalance === 0);
await be.addCustomerTransaction(sid, cust.id, { date: "2020-01-01", type: "credit", amount: 5000, note: "" });
const afterPay = await be.addCustomerTransaction(sid, cust.id, { date: "2020-01-02", type: "payment", amount: 2000, note: "" });
ok("balance = credit - payments", afterPay.outstandingBalance === 3000, String(afterPay.outstandingBalance));
ok("transactions appended", afterPay.transactions.length === 2);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
