/**
 * Local demo backend.
 *
 * Used only when no Firebase project is configured, so the app is explorable
 * (and reviewable) before credentials exist. It mirrors the Cloud Function +
 * Firestore API surface exactly, backed by localStorage. PINs here are stored
 * in the browser for demo convenience — in the real backend they are bcrypt
 * hashes in a collection no client can read.
 */

const KEY = "stationledger.demo.v3";

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);

function seed() {
  const ownerId = uid("u");
  const s1 = uid("st");
  const s2 = uid("st");
  const mgrId = uid("u");
  const attId = uid("u");

  const p1 = uid("p"), p2 = uid("p"), p3 = uid("p");
  const n1 = uid("n"), n2 = uid("n"), n3 = uid("n"), n4 = uid("n"), n5 = uid("n"), n6 = uid("n");

  const cust1 = uid("c");
  const cust2 = uid("c");
  const cust3 = uid("c");

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };

  const mkShift = (stationId, offset, name, readings, by, byName, cashAdj = 0) => {
    const gross = readings.reduce((n, r) => n + (r.closing - r.opening) * r.rate, 0);
    const credit = name === "Evening" && offset < 2 ? 18400 : 0;
    const digital = Math.round(gross * 0.18);
    const expenses = offset % 2 === 0 ? [{ label: "Power bill", amount: 1850 }] : [];
    const expTotal = expenses.reduce((n, e) => n + e.amount, 0);
    const expected = gross - credit - digital - expTotal;
    const at = new Date(Date.now() - offset * 86400000);
    return {
      id: uid("sh"),
      stationId,
      name,
      status: "closed",
      date: day(offset),
      openedAt: new Date(at.getTime() - 28800000).toISOString(),
      openedBy: by,
      openedByName: byName,
      closedAt: at.toISOString(),
      closedBy: by,
      closedByName: byName,
      readings: Object.fromEntries(
        readings.map((r) => [
          r.id,
          { label: r.label, fuelType: r.fuelType, opening: r.opening, closing: r.closing, rate: r.rate },
        ])
      ),
      expenses,
      creditSales: credit
        ? [{ customerId: cust1, name: "Sri Balaji Transports", amount: credit }]
        : [],
      digitalCollected: digital,
      cashDeclared: +(expected + cashAdj).toFixed(2),
      note: "",
    };
  };


  return {
    users: {
      [ownerId]: {
        uid: ownerId,
        name: "Ravi Kumar",
        phone: "+91 98480 11223",
        role: "owner",
        ownerId,
        stationIds: [s1, s2],
        username: "ravikumar",
        createdAt: nowISO(),
      },
      [mgrId]: {
        uid: mgrId,
        name: "Suresh Babu",
        phone: "+91 98765 44556",
        role: "manager",
        ownerId,
        stationIds: [s1],
        username: "sureshbabu",
        createdAt: nowISO(),
      },
      [attId]: {
        uid: attId,
        name: "Mahesh N",
        phone: "+91 90000 77881",
        role: "attendant",
        ownerId,
        stationIds: [s1],
        username: "maheshn",
        createdAt: nowISO(),
      },
      dev_admin: {
        uid: "dev_admin",
        name: "Developer",
        phone: "—",
        role: "admin",
        ownerId: null,
        stationIds: [],
        username: "developer",
        createdAt: nowISO(),
      },
    },
    pins: {
      developer: "4820",
      ravikumar: "2468",
      sureshbabu: "1357",
      maheshn: "9753",
    },
    usernames: {
      developer: "dev_admin",
      ravikumar: ownerId,
      sureshbabu: mgrId,
      maheshn: attId,
    },
    stations: {
      [s1]: {
        id: s1,
        name: "Highway 44 Fuel Point",
        address: "NH-44, Shamirpet, Hyderabad",
        ownerId,
        createdAt: nowISO(),
      },
      [s2]: {
        id: s2,
        name: "City Centre Filling Station",
        address: "Beside RTO Office, Karimnagar",
        ownerId,
        createdAt: nowISO(),
      },
    },
    ledger: { [s1]: [], [s2]: [] },
    pumps: {
      [s1]: [
        { id: p1, name: "Pump 1", createdAt: nowISO() },
        { id: p2, name: "Pump 2", createdAt: nowISO() },
      ],
      [s2]: [{ id: p3, name: "Pump 1", createdAt: nowISO() }],
    },
    nozzles: {
      [s1]: [
        { id: n1, pumpId: p1, name: "N1", fuelType: "Petrol", currentReading: 148230.5, createdAt: nowISO() },
        { id: n2, pumpId: p1, name: "N2", fuelType: "Diesel", currentReading: 203411.0, createdAt: nowISO() },
        { id: n3, pumpId: p2, name: "N1", fuelType: "Petrol", currentReading: 96755.25, createdAt: nowISO() },
        { id: n4, pumpId: p2, name: "N2", fuelType: "Diesel", currentReading: 121008.75, createdAt: nowISO() },
      ],
      [s2]: [
        { id: n5, pumpId: p3, name: "N1", fuelType: "Petrol", currentReading: 54120.0, createdAt: nowISO() },
        { id: n6, pumpId: p3, name: "N2", fuelType: "Diesel", currentReading: 77310.5, createdAt: nowISO() },
      ],
    },
    rates: {
      [s1]: { Petrol: 104.8, Diesel: 91.6 },
      [s2]: { Petrol: 105.2, Diesel: 92.1 },
    },
    rateHistory: {
      [s1]: [
        { date: todayISO(), fuelType: "Petrol", rate: 104.8, setByName: "Ravi Kumar", at: nowISO() },
        { date: todayISO(), fuelType: "Diesel", rate: 91.6, setByName: "Ravi Kumar", at: nowISO() },
      ],
      [s2]: [],
    },
    shifts: {
      [s1]: [
        mkShift(s1, 1, "Evening", [
          { id: n1, label: "Pump 1 · N1", fuelType: "Petrol", opening: 147180.5, closing: 147705.5, rate: 104.8 },
          { id: n2, label: "Pump 1 · N2", fuelType: "Diesel", opening: 202495.0, closing: 203080.0, rate: 91.6 },
          { id: n3, label: "Pump 2 · N1", fuelType: "Petrol", opening: 96240.25, closing: 96520.25, rate: 104.8 },
          { id: n4, label: "Pump 2 · N2", fuelType: "Diesel", opening: 120520.75, closing: 120870.75, rate: 91.6 },
        ], attId, "Mahesh N", -240),
        mkShift(s1, 1, "Morning", [
          { id: n1, label: "Pump 1 · N1", fuelType: "Petrol", opening: 146700.5, closing: 147180.5, rate: 104.8 },
          { id: n2, label: "Pump 1 · N2", fuelType: "Diesel", opening: 201950.0, closing: 202495.0, rate: 91.6 },
          { id: n3, label: "Pump 2 · N1", fuelType: "Petrol", opening: 95980.25, closing: 96240.25, rate: 104.8 },
          { id: n4, label: "Pump 2 · N2", fuelType: "Diesel", opening: 120190.75, closing: 120520.75, rate: 91.6 },
        ], mgrId, "Suresh Babu", 0),
        mkShift(s1, 2, "Evening", [
          { id: n1, label: "Pump 1 · N1", fuelType: "Petrol", opening: 146210.5, closing: 146700.5, rate: 104.2 },
          { id: n2, label: "Pump 1 · N2", fuelType: "Diesel", opening: 201400.0, closing: 201950.0, rate: 91.2 },
          { id: n3, label: "Pump 2 · N1", fuelType: "Petrol", opening: 95720.25, closing: 95980.25, rate: 104.2 },
          { id: n4, label: "Pump 2 · N2", fuelType: "Diesel", opening: 119880.75, closing: 120190.75, rate: 91.2 },
        ], attId, "Mahesh N", 120),
      ],
      [s2]: [
        mkShift(s2, 1, "Full day", [
          { id: n5, label: "Pump 1 · N1", fuelType: "Petrol", opening: 53480.0, closing: 54120.0, rate: 105.2 },
          { id: n6, label: "Pump 1 · N2", fuelType: "Diesel", opening: 76580.5, closing: 77310.5, rate: 92.1 },
        ], ownerId, "Ravi Kumar", 0),
      ],
    },
    credit: {
      [s1]: [
        {
          id: cust1,
          name: "Sri Balaji Transports",
          phone: "+91 90101 22334",
          outstandingBalance: 54600,
          createdAt: nowISO(),
          transactions: [
            { date: todayISO(), type: "credit", amount: 18400, note: "Diesel 200L" },
            { date: todayISO(), type: "payment", amount: 20000, note: "NEFT" },
            { date: todayISO(), type: "credit", amount: 56200, note: "Fleet refill" },
          ],
        },
        {
          id: cust2,
          name: "Anand Travels",
          phone: "+91 91234 55667",
          outstandingBalance: 0,
          createdAt: nowISO(),
          transactions: [
            { date: todayISO(), type: "credit", amount: 12000, note: "Bus fleet" },
            { date: todayISO(), type: "payment", amount: 12000, note: "Cash settled" },
          ],
        },
      ],
      [s2]: [
        {
          id: cust3,
          name: "Krishna Agro Works",
          phone: "+91 93333 12121",
          outstandingBalance: 8750,
          createdAt: nowISO(),
          transactions: [
            { date: todayISO(), type: "credit", amount: 8750, note: "Tractor diesel" },
          ],
        },
      ],
    },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to a fresh seed */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: stay in memory for this session */
  }
}

let state = null;
const db = () => (state ||= load());
const commit = () => save(state);
const clone = (v) => JSON.parse(JSON.stringify(v));
const delay = (ms = 140) => new Promise((r) => setTimeout(r, ms));

function slugify(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  return s || "user";
}

function uniqueUsername(base) {
  const d = db();
  let candidate = base;
  let i = 1;
  while (d.usernames[candidate]) {
    i += 1;
    candidate = `${base}${i}`;
  }
  return candidate;
}

/** Mirrors WEAK_PINS in functions/index.js. */
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
  "1212", "1122", "6969", "1004", "2000", "2001", "1010",
]);

export function pinProblem(pin) {
  if (!/^\d{4}$/.test(String(pin ?? ""))) return "The PIN must be exactly 4 digits.";
  if (WEAK_PINS.has(String(pin)))
    return "That PIN is too easy to guess. Avoid repeated digits and simple runs.";
  return null;
}

function assertPin(pin) {
  const problem = pinProblem(pin);
  if (problem) throw new Error(problem);
  return String(pin);
}

/* ------------------------------ session ------------------------------ */

const SESSION_KEY = "stationledger.demo.session";
let listeners = [];

function currentProfile() {
  const uidv = localStorage.getItem(SESSION_KEY);
  if (!uidv) return null;
  const u = db().users[uidv];
  return u ? clone(u) : null;
}

function emit() {
  const p = currentProfile();
  listeners.forEach((fn) => fn(p));
}

export const demoBackend = {
  isDemo: true,

  onAuth(callback) {
    listeners.push(callback);
    setTimeout(() => callback(currentProfile()), 0);
    return () => {
      listeners = listeners.filter((fn) => fn !== callback);
    };
  },

  async pinLogin({ username, pin }) {
    await delay();
    const d = db();
    const uname = String(username || "").trim().toLowerCase();
    const targetUid = d.usernames[uname];
    if (!targetUid || d.pins[uname] !== String(pin)) {
      throw new Error("Incorrect username or PIN.");
    }
    localStorage.setItem(SESSION_KEY, targetUid);
    emit();
    return clone(d.users[targetUid]);
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY);
    emit();
  },

  async createOwner({ ownerName, stationName, phone, address, pin }) {
    await delay(220);
    assertPin(pin);
    const d = db();
    const ownerUid = uid("u");
    const stationId = uid("st");
    const username = uniqueUsername(slugify(ownerName));

    d.users[ownerUid] = {
      uid: ownerUid,
      name: ownerName,
      phone,
      role: "owner",
      ownerId: ownerUid,
      stationIds: [stationId],
      username,
      createdAt: nowISO(),
    };
    d.usernames[username] = ownerUid;
    d.pins[username] = pin;
    d.stations[stationId] = {
      id: stationId,
      name: stationName,
      address,
      ownerId: ownerUid,
      createdAt: nowISO(),
    };
    d.ledger[stationId] = [];
    d.credit[stationId] = [];
    commit();
    return { username, uid: ownerUid, stationId };
  },

  async createStaff({ name, phone, stationId, role, pin }, caller) {
    await delay(220);
    assertPin(pin);
    const d = db();
    const station = d.stations[stationId];
    if (!station || station.ownerId !== caller.uid) {
      throw new Error("That station is not yours.");
    }
    const staffUid = uid("u");
    const username = uniqueUsername(slugify(name));
    d.users[staffUid] = {
      uid: staffUid,
      name,
      phone,
      role,
      ownerId: caller.uid,
      stationIds: [stationId],
      username,
      createdAt: nowISO(),
    };
    d.usernames[username] = staffUid;
    d.pins[username] = pin;
    commit();
    return { username, uid: staffUid, stationId };
  },

  async resetPin({ uid: targetUid, pin }, caller) {
    await delay(200);
    assertPin(pin);
    const d = db();
    const target = d.users[targetUid];
    if (!target) throw new Error("That account does not exist.");

    const isAdmin = caller.role === "admin";
    const isTheirOwner =
      caller.role === "owner" && target.role !== "owner" && target.ownerId === caller.uid;
    if (!isAdmin && !isTheirOwner) {
      throw new Error("You cannot reset that account's PIN.");
    }

    d.pins[target.username] = String(pin);
    commit();
    return { ok: true, username: target.username };
  },

  async addStation({ name, address }, caller) {
    await delay(200);
    const d = db();
    const stationId = uid("st");
    d.stations[stationId] = {
      id: stationId,
      name,
      address,
      ownerId: caller.uid,
      createdAt: nowISO(),
    };
    d.users[caller.uid].stationIds.push(stationId);
    d.ledger[stationId] = [];
    d.credit[stationId] = [];
    commit();
    return { stationId, name, address };
  },

  async listStations(profile) {
    await delay(80);
    const d = db();
    const all = Object.values(d.stations);
    if (profile.role === "owner") {
      return clone(all.filter((s) => s.ownerId === profile.ownerId));
    }
    return clone(all.filter((s) => profile.stationIds.includes(s.id)));
  },

  async listOwners() {
    await delay(80);
    return clone(Object.values(db().users).filter((u) => u.role === "owner"));
  },

  async listStaff(profile) {
    await delay(80);
    const d = db();
    return clone(
      Object.values(d.users).filter(
        (u) => u.ownerId === profile.uid && u.uid !== profile.uid
      )
    );
  },

  /* ----------------------- pumps & nozzles ----------------------- */

  async listPumps(stationId) {
    await delay(60);
    const d = db();
    return clone({
      pumps: d.pumps[stationId] || [],
      nozzles: d.nozzles[stationId] || [],
    });
  },

  async addPump(stationId, { name }) {
    await delay(150);
    const d = db();
    d.pumps[stationId] ||= [];
    const row = { id: uid("p"), name, createdAt: nowISO() };
    d.pumps[stationId].push(row);
    commit();
    return row;
  },

  async addNozzle(stationId, { pumpId, name, fuelType, openingReading }) {
    await delay(150);
    const d = db();
    d.nozzles[stationId] ||= [];
    const row = {
      id: uid("n"),
      pumpId,
      name,
      fuelType,
      currentReading: Number(openingReading) || 0,
      createdAt: nowISO(),
    };
    d.nozzles[stationId].push(row);
    commit();
    return row;
  },

  async removeNozzle(stationId, nozzleId) {
    await delay(120);
    const d = db();
    const open = (d.shifts[stationId] || []).some(
      (sh) => sh.status === "open" && sh.readings?.[nozzleId]
    );
    if (open) throw new Error("That nozzle is part of an open shift.");
    d.nozzles[stationId] = (d.nozzles[stationId] || []).filter((n) => n.id !== nozzleId);
    commit();
  },

  async removePump(stationId, pumpId) {
    await delay(120);
    const d = db();
    const hasNozzles = (d.nozzles[stationId] || []).some((n) => n.pumpId === pumpId);
    if (hasNozzles) throw new Error("Remove the pump's nozzles first.");
    d.pumps[stationId] = (d.pumps[stationId] || []).filter((p) => p.id !== pumpId);
    commit();
  },

  /* --------------------------- rates ----------------------------- */

  async getRates(stationId) {
    await delay(60);
    const d = db();
    return clone({
      rates: d.rates[stationId] || {},
      history: (d.rateHistory[stationId] || []).slice(-40).reverse(),
    });
  },

  async setRate(stationId, { fuelType, rate }, caller) {
    await delay(150);
    const d = db();
    d.rates[stationId] ||= {};
    d.rates[stationId][fuelType] = Number(rate);
    d.rateHistory[stationId] ||= [];
    d.rateHistory[stationId].push({
      date: todayISO(),
      fuelType,
      rate: Number(rate),
      setByName: caller?.name || "—",
      at: nowISO(),
    });
    commit();
    return clone(d.rates[stationId]);
  },

  /* --------------------------- shifts ---------------------------- */

  async listShifts(stationId) {
    await delay(80);
    const rows = db().shifts[stationId] || [];
    return clone([...rows].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)));
  },

  async openShift(stationId, { name }, caller) {
    await delay(180);
    const d = db();
    d.shifts[stationId] ||= [];
    if (d.shifts[stationId].some((sh) => sh.status === "open")) {
      throw new Error("A shift is already open at this station. Close it first.");
    }

    const nozzles = d.nozzles[stationId] || [];
    if (nozzles.length === 0) {
      throw new Error("Add at least one pump and nozzle before opening a shift.");
    }
    const rates = d.rates[stationId] || {};
    const missing = [...new Set(nozzles.map((n) => n.fuelType))].filter((f) => !rates[f]);
    if (missing.length) {
      throw new Error(`Set today's rate for ${missing.join(", ")} before opening a shift.`);
    }

    // Opening readings come from each nozzle's running totaliser, and the
    // rate in force is snapshotted now so later rate changes never reprice
    // this shift.
    const readings = {};
    nozzles.forEach((n) => {
      readings[n.id] = {
        label: `${(d.pumps[stationId] || []).find((p) => p.id === n.pumpId)?.name || "Pump"} · ${n.name}`,
        fuelType: n.fuelType,
        opening: n.currentReading,
        closing: "",
        rate: rates[n.fuelType],
      };
    });

    const shift = {
      id: uid("sh"),
      stationId,
      name: name || "Shift",
      status: "open",
      openedAt: nowISO(),
      openedBy: caller.uid,
      openedByName: caller.name,
      closedAt: null,
      closedBy: null,
      closedByName: null,
      date: todayISO(),
      readings,
      expenses: [],
      creditSales: [],
      digitalCollected: 0,
      cashDeclared: "",
      note: "",
    };
    d.shifts[stationId].unshift(shift);
    commit();
    return clone(shift);
  },

  async closeShift(stationId, shiftId, payload, caller) {
    await delay(200);
    const d = db();
    const shift = (d.shifts[stationId] || []).find((sh) => sh.id === shiftId);
    if (!shift) throw new Error("Shift not found.");
    if (shift.status === "closed") throw new Error("That shift is already closed.");

    Object.entries(payload.readings || {}).forEach(([nozzleId, r]) => {
      if (shift.readings[nozzleId]) {
        shift.readings[nozzleId].closing = Number(r.closing);
      }
    });

    shift.expenses = (payload.expenses || []).map((e) => ({
      label: String(e.label || "").trim(),
      amount: Number(e.amount) || 0,
    }));
    shift.creditSales = (payload.creditSales || []).map((c) => ({
      customerId: c.customerId || null,
      name: String(c.name || "").trim(),
      amount: Number(c.amount) || 0,
    }));
    shift.digitalCollected = Number(payload.digitalCollected) || 0;
    shift.cashDeclared = Number(payload.cashDeclared) || 0;
    shift.note = String(payload.note || "").trim();
    shift.status = "closed";
    shift.closedAt = nowISO();
    shift.closedBy = caller.uid;
    shift.closedByName = caller.name;

    // The closing reading becomes the next shift's opening.
    (d.nozzles[stationId] || []).forEach((n) => {
      const r = shift.readings[n.id];
      if (r && r.closing !== "") n.currentReading = Number(r.closing);
    });

    // Credit taken during the shift posts to the customer's account.
    shift.creditSales.forEach((c) => {
      if (!c.customerId) return;
      const cust = (d.credit[stationId] || []).find((x) => x.id === c.customerId);
      if (!cust) return;
      cust.transactions = [
        ...(cust.transactions || []),
        { date: shift.date, type: "credit", amount: c.amount, note: `${shift.name} shift` },
      ];
      cust.outstandingBalance = Number(cust.outstandingBalance || 0) + c.amount;
    });

    commit();
    return clone(shift);
  },

  async amendShift(stationId, shiftId, patch) {
    await delay(180);
    const d = db();
    const list = d.shifts[stationId] || [];
    const i = list.findIndex((sh) => sh.id === shiftId);
    if (i === -1) throw new Error("Shift not found.");
    list[i] = { ...list[i], ...clone(patch), amendedAt: nowISO() };
    commit();
    return clone(list[i]);
  },





  async listCustomers(stationId) {
    await delay(80);
    return clone(db().credit[stationId] || []);
  },

  async createCustomer(stationId, { name, phone }) {
    await delay(160);
    const d = db();
    d.credit[stationId] ||= [];
    const row = {
      id: uid("c"),
      name,
      phone,
      outstandingBalance: 0,
      createdAt: nowISO(),
      transactions: [],
    };
    d.credit[stationId].push(row);
    commit();
    return row;
  },

  async addCustomerTransaction(stationId, customerId, tx) {
    await delay(160);
    const d = db();
    const cust = (d.credit[stationId] || []).find((c) => c.id === customerId);
    if (!cust) throw new Error("Customer not found.");
    cust.transactions = [...(cust.transactions || []), clone(tx)];
    const delta = tx.type === "credit" ? Number(tx.amount) : -Number(tx.amount);
    cust.outstandingBalance = Number(cust.outstandingBalance || 0) + delta;
    commit();
    return clone(cust);
  },

  /** Demo-only: the seeded logins shown on the sign-in screen. */
  demoLogins() {
    const d = db();
    return Object.entries(d.usernames)
      .map(([username, id]) => ({
        username,
        pin: d.pins[username],
        role: d.users[id]?.role,
        name: d.users[id]?.name,
      }))
      .filter((r) => r.pin);
  },

  reset() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(KEY);
    state = null;
    emit();
  },
};
