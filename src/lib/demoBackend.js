/**
 * Local demo backend.
 *
 * Used only when no Firebase project is configured, so the app is explorable
 * (and reviewable) before credentials exist. It mirrors the Cloud Function +
 * Firestore API surface exactly, backed by localStorage. PINs here are stored
 * in the browser for demo convenience — in the real backend they are bcrypt
 * hashes in a collection no client can read.
 */

const KEY = "stationledger.demo.v1";

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);

function seed() {
  const ownerId = uid("u");
  const s1 = uid("st");
  const s2 = uid("st");
  const mgrId = uid("u");
  const attId = uid("u");

  const cust1 = uid("c");
  const cust2 = uid("c");
  const cust3 = uid("c");

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };

  const mkEntry = (stationId, offset, petrolL, dieselL, by, byName) => ({
    id: uid("e"),
    stationId,
    date: day(offset),
    enteredBy: by,
    enteredByName: byName,
    createdAt: new Date(Date.now() - offset * 86400000).toISOString(),
    fuelSales: {
      Petrol: {
        litres: petrolL,
        ratePerLitre: 104.8,
        amount: +(petrolL * 104.8).toFixed(2),
      },
      Diesel: {
        litres: dieselL,
        ratePerLitre: 91.6,
        amount: +(dieselL * 91.6).toFixed(2),
      },
    },
    tankReadings: {
      Petrol: { opening: 12000 - offset * 900, closing: 12000 - offset * 900 - petrolL },
      Diesel: { opening: 15000 - offset * 1100, closing: 15000 - offset * 1100 - dieselL },
    },
    cashIn: offset === 0 ? 5000 : 3000,
    cashOut: 2000,
    expenses:
      offset % 2 === 0
        ? [
            { label: "Power bill", amount: 1850 },
            { label: "Staff tea", amount: 260 },
          ]
        : [{ label: "Pump maintenance", amount: 1200 }],
    creditSales:
      offset < 3
        ? [{ customerId: cust1, name: "Sri Balaji Transports", amount: 18400 }]
        : [],
  });

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
      developer: "1234",
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
    ledger: {
      [s1]: [
        mkEntry(s1, 0, 1420, 2310, attId, "Mahesh N"),
        mkEntry(s1, 1, 1280, 2050, attId, "Mahesh N"),
        mkEntry(s1, 2, 1395, 1980, mgrId, "Suresh Babu"),
        mkEntry(s1, 3, 1180, 2240, attId, "Mahesh N"),
      ],
      [s2]: [
        mkEntry(s2, 0, 860, 1490, ownerId, "Ravi Kumar"),
        mkEntry(s2, 1, 910, 1385, ownerId, "Ravi Kumar"),
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

const randomPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0");

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

  async createOwner({ ownerName, stationName, phone, address }) {
    await delay(220);
    const d = db();
    const ownerUid = uid("u");
    const stationId = uid("st");
    const username = uniqueUsername(slugify(ownerName));
    const pin = randomPin();

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
    return { username, pin, uid: ownerUid, stationId };
  },

  async createStaff({ name, phone, stationId, role }, caller) {
    await delay(220);
    const d = db();
    const station = d.stations[stationId];
    if (!station || station.ownerId !== caller.uid) {
      throw new Error("That station is not yours.");
    }
    const staffUid = uid("u");
    const username = uniqueUsername(slugify(name));
    const pin = randomPin();
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
    return { username, pin, uid: staffUid, stationId };
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

  async listStaff(profile) {
    await delay(80);
    const d = db();
    return clone(
      Object.values(d.users).filter(
        (u) => u.ownerId === profile.uid && u.uid !== profile.uid
      )
    );
  },

  async listEntries(stationId) {
    await delay(80);
    const rows = db().ledger[stationId] || [];
    return clone(
      [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    );
  },

  async createEntry(stationId, entry) {
    await delay(160);
    const d = db();
    d.ledger[stationId] ||= [];
    const row = { ...clone(entry), id: uid("e"), stationId, createdAt: nowISO() };
    d.ledger[stationId].unshift(row);
    commit();
    return row;
  },

  async updateEntry(stationId, entryId, patch) {
    await delay(160);
    const d = db();
    const list = d.ledger[stationId] || [];
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx === -1) throw new Error("Entry not found.");
    list[idx] = { ...list[idx], ...clone(patch), updatedAt: nowISO() };
    commit();
    return list[idx];
  },

  async deleteEntry(stationId, entryId) {
    await delay(140);
    const d = db();
    d.ledger[stationId] = (d.ledger[stationId] || []).filter((e) => e.id !== entryId);
    commit();
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
