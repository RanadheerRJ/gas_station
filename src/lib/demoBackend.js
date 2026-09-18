/**
 * Local demo backend.
 *
 * Used only when no Firebase project is configured, so the app is explorable
 * (and reviewable) before credentials exist. It mirrors the Cloud Function +
 * Firestore API surface exactly, backed by localStorage. PINs here are stored
 * in the browser for demo convenience — in the real backend they are bcrypt
 * hashes in a collection no client can read.
 */

const KEY = "stationledger.demo.v4";

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

  const mkShift = (stationId, offset, employeeName, userId, nozzles, cashAdj = 0) => {
    const gross = nozzles.reduce(
      (n, r) => n + (r.closingReading - r.openingReading) * r.price,
      0
    );
    const expenses = offset % 2 === 0 ? [{ label: "Power bill", amount: 1850 }] : [];
    const expTotal = expenses.reduce((n, e) => n + e.amount, 0);
    const net = gross - expTotal - 980; // 520 MS + 460 HSD testing
    const credit = offset < 2 && employeeName === "Mahesh N" ? 18400 : 0;
    const upi = Math.round(net * 0.18);
    const card = Math.round(net * 0.07);
    const at = new Date(Date.now() - offset * 86400000);
    return {
      id: uid("sh"),
      stationId,
      employeeName,
      userId,
      status: "approved",
      approvedByName: "Ravi Kumar",
      approvedAt: at.toISOString(),
      testing: { MS: 520, HSD: 460 },
      date: day(offset),
      startTime: new Date(at.getTime() - 28800000).toISOString(),
      endTime: at.toISOString(),
      openedByName: employeeName,
      closedByName: employeeName,
      nozzles: nozzles.map((n) => ({ ...n })),
      expenses,
      creditSales: credit
        ? [{ customerId: cust1, name: "Sri Balaji Transports", amount: credit }]
        : [],
      payments: {
        cash: +(net - upi - card - credit + cashAdj).toFixed(2),
        card,
        upi,
        credit,
        other: 0,
      },
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
        { id: n1, pumpId: p1, name: "N1", fuelType: "Petrol", lastReading: 148230.5, createdAt: nowISO() },
        { id: n2, pumpId: p1, name: "N2", fuelType: "Diesel", lastReading: 203411.0, createdAt: nowISO() },
        { id: n3, pumpId: p2, name: "N1", fuelType: "Petrol", lastReading: 96755.25, createdAt: nowISO() },
        { id: n4, pumpId: p2, name: "N2", fuelType: "Diesel", lastReading: 121008.75, createdAt: nowISO() },
      ],
      [s2]: [
        { id: n5, pumpId: p3, name: "N1", fuelType: "Petrol", lastReading: 54120.0, createdAt: nowISO() },
        { id: n6, pumpId: p3, name: "N2", fuelType: "Diesel", lastReading: 77310.5, createdAt: nowISO() },
      ],
    },
    prices: {
      [s1]: [
        { id: uid("pr"), stationId: s1, fuelType: "Petrol", price: 104.2,
          effectiveFrom: new Date(Date.now() - 3 * 86400000).toISOString(),
          effectiveTo: new Date(Date.now() - 86400000).toISOString(), setByName: "Ravi Kumar" },
        { id: uid("pr"), stationId: s1, fuelType: "Diesel", price: 91.2,
          effectiveFrom: new Date(Date.now() - 3 * 86400000).toISOString(),
          effectiveTo: new Date(Date.now() - 86400000).toISOString(), setByName: "Ravi Kumar" },
        { id: uid("pr"), stationId: s1, fuelType: "Petrol", price: 104.8,
          effectiveFrom: new Date(Date.now() - 86400000).toISOString(),
          effectiveTo: null, setByName: "Ravi Kumar" },
        { id: uid("pr"), stationId: s1, fuelType: "Diesel", price: 91.6,
          effectiveFrom: new Date(Date.now() - 86400000).toISOString(),
          effectiveTo: null, setByName: "Ravi Kumar" },
      ],
      [s2]: [
        { id: uid("pr"), stationId: s2, fuelType: "Petrol", price: 105.2,
          effectiveFrom: new Date(Date.now() - 2 * 86400000).toISOString(),
          effectiveTo: null, setByName: "Ravi Kumar" },
        { id: uid("pr"), stationId: s2, fuelType: "Diesel", price: 92.1,
          effectiveFrom: new Date(Date.now() - 2 * 86400000).toISOString(),
          effectiveTo: null, setByName: "Ravi Kumar" },
      ],
    },
    shifts: {
      [s1]: [
        mkShift(s1, 1, "Mahesh N", attId, [
          { nozzleId: n1, pumpId: p1, label: "Pump 1 · N1", fuelType: "Petrol", openingReading: 147180.5, closingReading: 147705.5, price: 104.8 },
          { nozzleId: n2, pumpId: p1, label: "Pump 1 · N2", fuelType: "Diesel", openingReading: 202495.0, closingReading: 203080.0, price: 91.6 },
        ], -240),
        mkShift(s1, 1, "Suresh Babu", mgrId, [
          { nozzleId: n3, pumpId: p2, label: "Pump 2 · N1", fuelType: "Petrol", openingReading: 96240.25, closingReading: 96520.25, price: 104.8 },
          { nozzleId: n4, pumpId: p2, label: "Pump 2 · N2", fuelType: "Diesel", openingReading: 120520.75, closingReading: 120870.75, price: 91.6 },
        ], 0),
        mkShift(s1, 2, "Mahesh N", attId, [
          { nozzleId: n1, pumpId: p1, label: "Pump 1 · N1", fuelType: "Petrol", openingReading: 146700.5, closingReading: 147180.5, price: 104.2 },
          { nozzleId: n2, pumpId: p1, label: "Pump 1 · N2", fuelType: "Diesel", openingReading: 201950.0, closingReading: 202495.0, price: 91.2 },
        ], 120),
      ],
      [s2]: [
        mkShift(s2, 1, "Ravi Kumar", ownerId, [
          { nozzleId: n5, pumpId: p3, label: "Pump 1 · N1", fuelType: "Petrol", openingReading: 53480.0, closingReading: 54120.0, price: 105.2 },
          { nozzleId: n6, pumpId: p3, label: "Pump 1 · N2", fuelType: "Diesel", openingReading: 76580.5, closingReading: 77310.5, price: 92.1 },
        ], 0),
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

  async deleteStation(stationId, caller) {
    await delay(220);
    const d = db();
    const station = d.stations[stationId];
    if (!station) throw new Error("Station not found.");
    if (station.ownerId !== caller.uid) throw new Error("That station is not yours.");
    const openShift = (d.shifts[stationId] || []).some((sh) => sh.status === "open");
    if (openShift) throw new Error("Close the open shift before deleting this station.");

    delete d.stations[stationId];
    delete d.shifts[stationId];
    delete d.pumps[stationId];
    delete d.nozzles[stationId];
    delete d.prices[stationId];
    delete d.credit[stationId];
    delete d.ledger[stationId];
    Object.values(d.users).forEach((u) => {
      if (u.stationIds) u.stationIds = u.stationIds.filter((id) => id !== stationId);
    });
    commit();
    return { ok: true };
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
      lastReading: Number(openingReading) || 0,
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
      (sh) =>
        sh.status === "open" && (sh.nozzles || []).some((n) => n.nozzleId === nozzleId)
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

  async getPrices(stationId) {
    await delay(60);
    const rows = db().prices[stationId] || [];
    return clone(
      [...rows].sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))
    );
  },

  /**
   * Setting a price closes the previous active record and opens a new one,
   * so history is never overwritten and past shifts reprice correctly.
   */
  async setPrice(stationId, { fuelType, price }, caller) {
    await delay(150);
    const d = db();
    d.prices[stationId] ||= [];
    const now = nowISO();
    d.prices[stationId]
      .filter((p) => p.fuelType === fuelType && !p.effectiveTo)
      .forEach((p) => {
        p.effectiveTo = now;
      });
    const row = {
      id: uid("pr"),
      stationId,
      fuelType,
      price: Number(price),
      effectiveFrom: now,
      effectiveTo: null,
      setBy: caller?.uid || null,
      setByName: caller?.name || "—",
    };
    d.prices[stationId].push(row);
    commit();
    return clone(row);
  },

  /* --------------------------- shifts ---------------------------- */

  async listShifts(stationId) {
    await delay(80);
    const rows = db().shifts[stationId] || [];
    return clone([...rows].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)));
  },

  /**
   * Start a shift on a chosen SUBSET of nozzles. Each nozzle can only be in
   * one open shift at a time, so several operators can work different pumps
   * concurrently. The price in force is snapshotted per nozzle.
   */
  async openShift(stationId, { employeeName, nozzleIds }, caller) {
    await delay(180);
    const d = db();
    d.shifts[stationId] ||= [];

    const picked = nozzleIds || [];
    if (picked.length === 0) throw new Error("Select at least one nozzle.");

    const busy = {};
    d.shifts[stationId]
      .filter((sh) => sh.status === "open")
      .forEach((sh) =>
        (sh.nozzles || []).forEach((n) => {
          busy[n.nozzleId] = sh.employeeName;
        })
      );

    const allNozzles = d.nozzles[stationId] || [];
    const pumps = d.pumps[stationId] || [];
    const prices = d.prices[stationId] || [];

    const taken = picked.filter((id) => busy[id]);
    if (taken.length) {
      throw new Error(`That nozzle is already in an active shift by ${busy[taken[0]]}.`);
    }

    const nozzles = picked.map((id) => {
      const nz = allNozzles.find((n) => n.id === id);
      if (!nz) throw new Error("Nozzle not found.");
      const active = prices
        .filter((pr) => pr.fuelType === nz.fuelType && !pr.effectiveTo)
        .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))[0];
      if (!active) {
        throw new Error(`Set a price for ${nz.fuelType} before starting a shift.`);
      }
      return {
        nozzleId: nz.id,
        pumpId: nz.pumpId,
        label: `${pumps.find((p) => p.id === nz.pumpId)?.name || "Pump"} · ${nz.name}`,
        fuelType: nz.fuelType,
        openingReading: nz.lastReading,
        closingReading: "",
        price: active.price,
        priceId: active.id,
      };
    });

    const shift = {
      id: uid("sh"),
      stationId,
      employeeName: employeeName || caller.name,
      userId: caller.uid,
      status: "open",
      date: todayISO(),
      startTime: nowISO(),
      endTime: null,
      openedByName: caller.name,
      closedByName: null,
      nozzles,
      expenses: [],
      creditSales: [],
      payments: { cash: "", card: "", upi: "", credit: "", other: "" },
      testing: { MS: "", HSD: "" },
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
    if (shift.status !== "open") throw new Error("That shift is already closed.");

    const closings = payload.closingReadings || {};
    shift.nozzles = shift.nozzles.map((n) => {
      const c = closings[n.nozzleId];
      if (c === undefined || c === null || c === "") {
        throw new Error(`Missing closing reading for ${n.label}.`);
      }
      return { ...n, closingReading: Number(c) };
    });

    shift.expenses = (payload.expenses || []).map((e) => ({
      label: String(e.label || "").trim(),
      amount: Number(e.amount) || 0,
    }));
    shift.creditSales = (payload.creditSales || []).map((c) => ({
      customerId: c.customerId || null,
      name: String(c.name || "").trim(),
      phone: String(c.phone || "").trim(),
      amount: Number(c.amount) || 0,
    }));
    shift.payments = {
      cash: Number(payload.payments?.cash) || 0,
      card: Number(payload.payments?.card) || 0,
      upi: Number(payload.payments?.upi) || 0,
      credit: Number(payload.payments?.credit) || 0,
      other: Number(payload.payments?.other) || 0,
    };
    shift.testing = {
      MS: Number(payload.testing?.MS) || 0,
      HSD: Number(payload.testing?.HSD) || 0,
    };
    shift.note = String(payload.note || "").trim();
    // Closing submits for review; the owner/manager has the last word.
    shift.status = "pending_review";
    shift.endTime = nowISO();
    shift.closedByName = caller.name;

    // Each nozzle's closing reading becomes its next opening.
    (d.nozzles[stationId] || []).forEach((nz) => {
      const line = shift.nozzles.find((n) => n.nozzleId === nz.id);
      if (line) nz.lastReading = Number(line.closingReading);
    });

    d.credit[stationId] ||= [];
    shift.creditSales = shift.creditSales.map((c) => {
      if (c.customerId) return c;
      // Walk-in credit: match an existing customer on phone, else register a
      // new one so the debt is always attached to a named account.
      const phone = String(c.phone || "").trim();
      const existing = phone
        ? d.credit[stationId].find((x) => String(x.phone || "").trim() === phone)
        : null;
      if (existing) return { ...c, customerId: existing.id };
      const created = {
        id: uid("c"),
        name: c.name || "Walk-in",
        phone,
        outstandingBalance: 0,
        createdAt: nowISO(),
        createdFromShift: shift.id,
        transactions: [],
      };
      d.credit[stationId].push(created);
      return { ...c, customerId: created.id };
    });

    shift.creditSales.forEach((c) => {
      if (!c.customerId) return;
      const cust = (d.credit[stationId] || []).find((x) => x.id === c.customerId);
      if (!cust) return;
      cust.transactions = [
        ...(cust.transactions || []),
        { date: shift.date, type: "credit", amount: c.amount, note: `${shift.employeeName} shift` },
      ];
      cust.outstandingBalance = Number(cust.outstandingBalance || 0) + c.amount;
    });

    commit();
    return clone(shift);
  },

  /**
   * Attach another nozzle to a shift already running — an operator often
   * picks up a second pump mid-shift.
   */
  async addNozzleToShift(stationId, shiftId, nozzleId, caller) {
    await delay(160);
    const d = db();
    const shift = (d.shifts[stationId] || []).find((sh) => sh.id === shiftId);
    if (!shift) throw new Error("Shift not found.");
    if (shift.status !== "open") throw new Error("Only an open shift can take more nozzles.");
    if ((shift.nozzles || []).some((n) => n.nozzleId === nozzleId)) {
      throw new Error("That nozzle is already on this shift.");
    }

    const busy = d.shifts[stationId].some(
      (sh) =>
        sh.status === "open" &&
        sh.id !== shiftId &&
        (sh.nozzles || []).some((n) => n.nozzleId === nozzleId)
    );
    if (busy) throw new Error("That nozzle is already in another active shift.");

    const nz = (d.nozzles[stationId] || []).find((n) => n.id === nozzleId);
    if (!nz) throw new Error("Nozzle not found.");
    const active = (d.prices[stationId] || [])
      .filter((pr) => pr.fuelType === nz.fuelType && !pr.effectiveTo)
      .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))[0];
    if (!active) throw new Error(`Set a price for ${nz.fuelType} first.`);

    shift.nozzles.push({
      nozzleId: nz.id,
      pumpId: nz.pumpId,
      label: `${(d.pumps[stationId] || []).find((p) => p.id === nz.pumpId)?.name || "Pump"} · ${nz.name}`,
      fuelType: nz.fuelType,
      openingReading: nz.lastReading,
      closingReading: "",
      price: active.price,
      priceId: active.id,
      addedAt: nowISO(),
    });
    commit();
    return clone(shift);
  },

  async removeNozzleFromShift(stationId, shiftId, nozzleId) {
    await delay(140);
    const d = db();
    const shift = (d.shifts[stationId] || []).find((sh) => sh.id === shiftId);
    if (!shift) throw new Error("Shift not found.");
    if (shift.status !== "open") throw new Error("Only an open shift can be changed.");
    if ((shift.nozzles || []).length <= 1) {
      throw new Error("A shift needs at least one nozzle.");
    }
    shift.nozzles = shift.nozzles.filter((n) => n.nozzleId !== nozzleId);
    commit();
    return clone(shift);
  },

  /** Owner/manager signs off a submitted shift. */
  async approveShift(stationId, shiftId, caller) {
    await delay(180);
    const d = db();
    const shift = (d.shifts[stationId] || []).find((sh) => sh.id === shiftId);
    if (!shift) throw new Error("Shift not found.");
    if (shift.status !== "pending_review" && shift.status !== "rejected") {
      throw new Error("Only a submitted shift can be approved.");
    }
    shift.status = "approved";
    shift.approvedByName = caller.name;
    shift.approvedAt = nowISO();
    shift.rejectionReason = null;
    commit();
    return clone(shift);
  },

  /** Send a shift back to the operator with a reason. */
  async rejectShift(stationId, shiftId, reason, caller) {
    await delay(180);
    const d = db();
    const shift = (d.shifts[stationId] || []).find((sh) => sh.id === shiftId);
    if (!shift) throw new Error("Shift not found.");
    if (shift.status !== "pending_review") {
      throw new Error("Only a submitted shift can be sent back.");
    }
    shift.status = "rejected";
    shift.rejectedByName = caller.name;
    shift.rejectedAt = nowISO();
    shift.rejectionReason = String(reason || "").trim() || "Correction requested";
    commit();
    return clone(shift);
  },

  /**
   * Amend a shift that is still under review. Expenses, testing and
   * payments stay editable until an owner approves it.
   */
  async reviseShift(stationId, shiftId, patch, caller) {
    await delay(180);
    const d = db();
    const shift = (d.shifts[stationId] || []).find((sh) => sh.id === shiftId);
    if (!shift) throw new Error("Shift not found.");
    if (shift.status === "approved") {
      throw new Error("An approved shift is locked. Ask the owner to reopen it.");
    }
    if (patch.expenses) {
      shift.expenses = patch.expenses.map((e) => ({
        label: String(e.label || "").trim(),
        amount: Number(e.amount) || 0,
      }));
    }
    if (patch.testing) {
      shift.testing = {
        MS: Number(patch.testing.MS) || 0,
        HSD: Number(patch.testing.HSD) || 0,
      };
    }
    if (patch.payments) {
      shift.payments = {
        cash: Number(patch.payments.cash) || 0,
        card: Number(patch.payments.card) || 0,
        upi: Number(patch.payments.upi) || 0,
        credit: Number(patch.payments.credit) || 0,
        other: Number(patch.payments.other) || 0,
      };
    }
    if (patch.note != null) shift.note = String(patch.note).trim();
    if (shift.status === "rejected") shift.status = "pending_review";
    shift.revisedByName = caller?.name || null;
    shift.revisedAt = nowISO();
    commit();
    return clone(shift);
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
