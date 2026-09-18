/**
 * Single data-access facade for the UI.
 *
 * When a Firebase project is configured it talks to Auth + Firestore +
 * callable Cloud Functions. Otherwise it delegates to the local demo backend
 * so the app is runnable without credentials. The UI never branches on this.
 */

import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut as fbSignOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { auth, db, functions, firebaseConfigured } from "./firebase";
import { pinProblem } from "./pin.js";

/**
 * Firebase is the only backend. A missing or half-filled .env.local is a
 * configuration error, not a reason to silently serve different data, so it
 * fails loudly at the first call rather than part-way through a shift.
 */
function assertConfigured() {
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and fill in " +
        "the VITE_FIREBASE_* values from your Firebase project settings."
    );
  }
}

/**
 * Every call and every query goes through one of these two, so the
 * configuration check lives in exactly two places instead of being repeated
 * in each of the forty-odd exported functions.
 */
const call = (name) => {
  assertConfigured();
  return httpsCallable(functions, name);
};

/** The Firestore handle, guaranteed non-null. */
function database() {
  assertConfigured();
  return db;
}

/** Normalise a callable/Firestore error into something a user can read. */
export function readableError(err) {
  const msg = err?.message || "Something went wrong.";
  return msg.replace(/^firebase:\s*/i, "").replace(/\s*\(.*\)\.?$/, "");
}

/* ------------------------------------------------------------------ */
/* auth                                                                */
/* ------------------------------------------------------------------ */

/**
 * Subscribes to the signed-in profile (users doc + claims), or null.
 * Returns an unsubscribe function.
 */
export function onAuthProfile(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null);
    try {
      const tokenResult = await user.getIdTokenResult(true);
      const claims = tokenResult.claims;

      if (claims.admin === true) {
        return callback({
          uid: user.uid,
          name: user.displayName || "Developer",
          role: "admin",
          ownerId: null,
          stationIds: [],
          username: claims.email || "developer",
        });
      }

      const snap = await getDoc(doc(database(), "users", user.uid));
      if (!snap.exists()) return callback(null);
      const data = snap.data();
      return callback({
        uid: user.uid,
        name: data.name,
        phone: data.phone,
        role: data.role || claims.role,
        ownerId: data.ownerId || claims.ownerId || null,
        stationIds: data.stationIds || (claims.stationId ? [claims.stationId] : []),
        username: data.username,
      });
    } catch (err) {
      console.error("Failed to resolve profile", err);
      return callback(null);
    }
  });
}

export async function pinLogin({ username, pin }) {
  const res = await call("pinLogin")({ username, pin });
  await signInWithCustomToken(auth, res.data.token);
  return res.data.profile;
}

export async function signOut() {
  return fbSignOut(auth);
}

/* ------------------------------------------------------------------ */
/* account provisioning (Cloud Functions only)                         */
/* ------------------------------------------------------------------ */

export async function createOwner(payload) {
  const res = await call("createOwner")(payload);
  return res.data;
}

export async function createStaff(payload) {
  const res = await call("createStaff")(payload);
  return res.data;
}

export async function resetPin(payload) {
  const res = await call("resetPin")(payload);
  return res.data;
}

export async function addStation(payload) {
  const res = await call("addStation")(payload);
  return res.data;
}

/* ------------------------------------------------------------------ */
/* stations & staff                                                    */
/* ------------------------------------------------------------------ */

export async function listStations(profile) {
  if (profile.role === "owner") {
    const snap = await getDocs(
      query(collection(database(), "stations"), where("ownerId", "==", profile.ownerId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const results = await Promise.all(
    (profile.stationIds || []).map(async (id) => {
      const s = await getDoc(doc(database(), "stations", id));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    })
  );
  return results.filter(Boolean);
}

/** Developer-only: every owner account in the system. */
export async function listOwners() {
  const snap = await getDocs(
    query(collection(database(), "users"), where("role", "==", "owner"))
  );
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function listStaff(profile) {
  const snap = await getDocs(
    query(collection(database(), "users"), where("ownerId", "==", profile.uid))
  );
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.uid !== profile.uid);
}

/* ------------------------------------------------------------------ */
/* pumps, nozzles & rates                                              */
/* ------------------------------------------------------------------ */

export async function listPumps(stationId) {
  const [pumpSnap, nozzleSnap] = await Promise.all([
    getDocs(collection(database(), "stations", stationId, "pumps")),
    getDocs(collection(database(), "stations", stationId, "nozzles")),
  ]);
  return {
    pumps: pumpSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    nozzles: nozzleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export async function addPump(stationId, payload) {
  const ref = await addDoc(collection(database(), "stations", stationId, "pumps"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...payload };
}

export async function addNozzle(stationId, payload) {
  const { openingReading, ...rest } = payload;
  const doc_ = {
    ...rest,
    lastReading: Number(openingReading) || 0,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(
    collection(database(), "stations", stationId, "nozzles"),
    doc_
  );
  return { id: ref.id, ...doc_ };
}

export async function setNozzleState(stationId, nozzleId, state) {
  await updateDoc(doc(database(), "stations", stationId, "nozzles", nozzleId), { state });
  return { id: nozzleId, state };
}

export async function setPumpState(stationId, pumpId, state) {
  const res = await call("setPumpState")({ stationId, pumpId, state });
  return res.data;
}

/**
 * Prices are effective-dated intervals, so a past shift can always be
 * repriced with the rate that actually applied when it ran.
 */
export async function getPrices(stationId) {
  const snap = await getDocs(
    query(
      collection(database(), "stations", stationId, "prices"),
      orderBy("effectiveFrom", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function setPrice(stationId, payload) {
  const res = await call("setPrice")({ stationId, ...payload });
  return res.data;
}

/* ------------------------------------------------------------------ */
/* shifts                                                              */
/* ------------------------------------------------------------------ */

export async function listShifts(stationId) {
  const snap = await getDocs(
    // startTime is the field openShift actually writes; ordering by anything
    // else returns an empty set in Firestore rather than failing loudly.
    query(
      collection(database(), "shifts", stationId, "records"),
      orderBy("startTime", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, stationId, ...d.data() }));
}

export async function openShift(stationId, payload) {
  const res = await call("openShift")({ stationId, ...payload });
  return res.data;
}

export async function closeShift(stationId, shiftId, payload) {
  const res = await call("closeShift")({ stationId, shiftId, ...payload });
  return res.data;
}

/* ------------------------------ tanks ------------------------------ */

export async function listTanks(stationId) {
  const [tankSnap, dipSnap] = await Promise.all([
    getDocs(
      query(collection(database(), "stations", stationId, "tanks"), orderBy("createdAt"))
    ),
    getDocs(
      query(
        collection(database(), "tankReadings", stationId, "readings"),
        orderBy("recordedAt", "desc")
      )
    ),
  ]);
  return {
    tanks: tankSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    dips: dipSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export async function addTank(stationId, tank) {
  const res = await call("addTank")({ stationId, ...tank });
  return res.data;
}

export async function setTankState(stationId, tankId, state) {
  const res = await call("setTankState")({ stationId, tankId, state });
  return res.data;
}

export async function updateTank(stationId, tankId, patch) {
  const res = await call("updateTank")({ stationId, tankId, ...patch });
  return res.data;
}

export async function recordDip(stationId, tankId, reading) {
  const res = await call("recordDip")({ stationId, tankId, ...reading });
  return res.data;
}

export async function recordDelivery(stationId, tankId, delivery) {
  const res = await call("recordDelivery")({ stationId, tankId, ...delivery });
  return res.data;
}

export async function addShiftExpense(stationId, shiftId, expense) {
  const res = await call("addShiftExpense")({ stationId, shiftId, ...expense });
  return res.data;
}

export async function removeShiftExpense(stationId, shiftId, index) {
  const res = await call("removeShiftExpense")({ stationId, shiftId, index });
  return res.data;
}

export async function approveShift(stationId, shiftId) {
  const res = await call("reviewShift")({ stationId, shiftId, action: "approve" });
  return res.data;
}

export async function rejectShift(stationId, shiftId, reason) {
  const res = await call("reviewShift")({ stationId, shiftId, action: "reject", reason });
  return res.data;
}

export async function reviseShift(stationId, shiftId, patch) {
  const res = await call("reviseShift")({ stationId, shiftId, ...patch });
  return res.data;
}

export async function setStationState(stationId, state) {
  const res = await call("setStationState")({ stationId, state });
  return res.data;
}

/* ------------------------------------------------------------------ */
/* credit customers                                                    */
/* ------------------------------------------------------------------ */

export async function listCustomers(stationId) {
  const snap = await getDocs(
    collection(database(), "creditCustomers", stationId, "customers")
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createCustomer(stationId, payload) {
  const ref = await addDoc(
    collection(database(), "creditCustomers", stationId, "customers"),
    {
      ...payload,
      outstandingBalance: 0,
      transactions: [],
      createdAt: serverTimestamp(),
    }
  );
  return { id: ref.id, ...payload, outstandingBalance: 0, transactions: [] };
}

/**
 * Post a credit sale or a repayment. Balance arithmetic happens server-side
 * in a transaction — a read-modify-write from the client would lose one of
 * two concurrent payments, and this is real money.
 */
export async function addCustomerTransaction(stationId, customerId, tx) {
  const res = await call("recordCustomerPayment")({
    stationId,
    customerId,
    type: tx.type,
    amount: tx.amount,
    note: tx.note || "",
    date: tx.date,
  });
  return res.data;
}

/** Client-side PIN validation, mirroring the server's rules. */
export { pinProblem };
