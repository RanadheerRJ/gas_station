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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { auth, db, functions, firebaseConfigured } from "./firebase";
import { demoBackend } from "./demoBackend";

const isDemo = !firebaseConfigured;

const call = (name) => httpsCallable(functions, name);

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
  if (isDemo) return demoBackend.onAuth(callback);

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

      const snap = await getDoc(doc(db, "users", user.uid));
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
  if (isDemo) return demoBackend.pinLogin({ username, pin });
  const res = await call("pinLogin")({ username, pin });
  await signInWithCustomToken(auth, res.data.token);
  return res.data.profile;
}

export async function signOut() {
  if (isDemo) return demoBackend.signOut();
  return fbSignOut(auth);
}

/* ------------------------------------------------------------------ */
/* account provisioning (Cloud Functions only)                         */
/* ------------------------------------------------------------------ */

export async function createOwner(payload) {
  if (isDemo) return demoBackend.createOwner(payload);
  const res = await call("createOwner")(payload);
  return res.data;
}

export async function createStaff(payload, profile) {
  if (isDemo) return demoBackend.createStaff(payload, profile);
  const res = await call("createStaff")(payload);
  return res.data;
}

export async function addStation(payload, profile) {
  if (isDemo) return demoBackend.addStation(payload, profile);
  const res = await call("addStation")(payload);
  return res.data;
}

/* ------------------------------------------------------------------ */
/* stations & staff                                                    */
/* ------------------------------------------------------------------ */

export async function listStations(profile) {
  if (isDemo) return demoBackend.listStations(profile);

  if (profile.role === "owner") {
    const snap = await getDocs(
      query(collection(db, "stations"), where("ownerId", "==", profile.ownerId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const results = await Promise.all(
    (profile.stationIds || []).map(async (id) => {
      const s = await getDoc(doc(db, "stations", id));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    })
  );
  return results.filter(Boolean);
}

export async function listStaff(profile) {
  if (isDemo) return demoBackend.listStaff(profile);
  const snap = await getDocs(
    query(collection(db, "users"), where("ownerId", "==", profile.uid))
  );
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.uid !== profile.uid);
}

/* ------------------------------------------------------------------ */
/* ledger                                                              */
/* ------------------------------------------------------------------ */

export async function listEntries(stationId) {
  if (isDemo) return demoBackend.listEntries(stationId);
  const snap = await getDocs(
    query(collection(db, "ledger", stationId, "entries"), orderBy("date", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, stationId, ...d.data() }));
}

export async function createEntry(stationId, entry, profile) {
  const payload = {
    ...entry,
    enteredBy: profile.uid,
    enteredByName: profile.name,
  };
  if (isDemo) return demoBackend.createEntry(stationId, payload);
  const ref = await addDoc(collection(db, "ledger", stationId, "entries"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, stationId, ...payload };
}

export async function updateEntry(stationId, entryId, patch) {
  if (isDemo) return demoBackend.updateEntry(stationId, entryId, patch);
  await updateDoc(doc(db, "ledger", stationId, "entries", entryId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  return { id: entryId, stationId, ...patch };
}

export async function deleteEntry(stationId, entryId) {
  if (isDemo) return demoBackend.deleteEntry(stationId, entryId);
  await deleteDoc(doc(db, "ledger", stationId, "entries", entryId));
}

/* ------------------------------------------------------------------ */
/* credit customers                                                    */
/* ------------------------------------------------------------------ */

export async function listCustomers(stationId) {
  if (isDemo) return demoBackend.listCustomers(stationId);
  const snap = await getDocs(collection(db, "creditCustomers", stationId, "customers"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createCustomer(stationId, payload) {
  if (isDemo) return demoBackend.createCustomer(stationId, payload);
  const ref = await addDoc(collection(db, "creditCustomers", stationId, "customers"), {
    ...payload,
    outstandingBalance: 0,
    transactions: [],
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...payload, outstandingBalance: 0, transactions: [] };
}

export async function addCustomerTransaction(stationId, customerId, tx) {
  if (isDemo) return demoBackend.addCustomerTransaction(stationId, customerId, tx);

  const ref = doc(db, "creditCustomers", stationId, "customers", customerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Customer not found.");
  const data = snap.data();
  const delta = tx.type === "credit" ? Number(tx.amount) : -Number(tx.amount);
  const next = {
    transactions: [...(data.transactions || []), tx],
    outstandingBalance: Number(data.outstandingBalance || 0) + delta,
  };
  await setDoc(ref, next, { merge: true });
  return { id: customerId, ...data, ...next };
}

export const backendInfo = {
  isDemo,
  demoLogins: () => (isDemo ? demoBackend.demoLogins() : []),
  reset: () => (isDemo ? demoBackend.reset() : undefined),
};
