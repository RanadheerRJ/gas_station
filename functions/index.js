/**
 * Cloud Functions (v2, callable) for the fuel station ledger platform.
 *
 * Account creation happens ONLY here, using the Admin SDK:
 *   createOwner  - developer/admin only
 *   createStaff  - owner only, for stations they own
 *   addStation   - owner only, for their own account
 *   pinLogin     - public; verifies a PIN and mints a custom auth token
 *
 * Raw PINs are never stored and never logged. Only a bcrypt hash lands in
 * Firestore, in a collection no client can read or write.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const auth = getAuth();

const BCRYPT_ROUNDS = 10;
const PIN_LENGTH = 4;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** A 4-digit PIN from a cryptographically strong source. Never logged. */
function generatePin() {
  const max = 10 ** PIN_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(PIN_LENGTH, "0");
}

/** "Ravi Kumar Reddy" -> "ravikumarreddy" (fallback "user" when empty). */
function slugify(name) {
  const slug = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return slug.slice(0, 20) || "user";
}

function requireString(value, field, { max = 120, min = 1 } = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpsError("invalid-argument", `"${field}" is required.`);
  }
  return trimmed;
}

/**
 * Claim a unique username. Runs inside a transaction so two simultaneous
 * invites can never take the same slug.
 */
async function claimUsername(baseSlug, uid) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}${attempt + 1}`;
    const ref = db.collection("usernames").doc(candidate);
    // eslint-disable-next-line no-await-in-loop
    const taken = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return true;
      tx.set(ref, { uid, createdAt: FieldValue.serverTimestamp() });
      return false;
    });
    if (!taken) return candidate;
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a username.");
}

/**
 * Create an Auth user + users doc + username lookup + hashed PIN.
 * Returns { uid, username, pin } — the raw pin is returned to the caller
 * exactly once and is never persisted.
 */
async function provisionAccount({ name, phone, role, ownerId, stationIds }) {
  const pin = generatePin();
  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

  const userRecord = await auth.createUser({
    displayName: name,
    disabled: false,
  });
  const uid = userRecord.uid;

  let username;
  try {
    username = await claimUsername(slugify(name), uid);

    const claims =
      role === "owner"
        ? { role: "owner", ownerId: uid }
        : { role, ownerId, stationId: stationIds[0] };
    await auth.setCustomUserClaims(uid, claims);

    const batch = db.batch();
    batch.set(db.collection("users").doc(uid), {
      name,
      phone,
      role,
      ownerId: role === "owner" ? uid : ownerId,
      stationIds,
      username,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.collection("authSecrets").doc(uid), {
      pinHash,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    // Roll back the half-created account so a retry can succeed cleanly.
    await auth.deleteUser(uid).catch(() => {});
    if (username) {
      await db.collection("usernames").doc(username).delete().catch(() => {});
    }
    throw err;
  }

  return { uid, username, pin };
}

function assertAdmin(request) {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Developer access required.");
  }
}

function assertOwner(request) {
  const token = request.auth?.token;
  if (!token || token.role !== "owner") {
    throw new HttpsError("permission-denied", "Owner access required.");
  }
  return request.auth.uid;
}

/* ------------------------------------------------------------------ */
/* createOwner — developer/admin only                                  */
/* ------------------------------------------------------------------ */

exports.createOwner = onCall(async (request) => {
  assertAdmin(request);

  const ownerName = requireString(request.data?.ownerName, "ownerName");
  const stationName = requireString(request.data?.stationName, "stationName");
  const phone = requireString(request.data?.phone, "phone", { max: 24 });
  const address = requireString(request.data?.address, "address", { max: 300 });

  const stationRef = db.collection("stations").doc();

  const { uid, username, pin } = await provisionAccount({
    name: ownerName,
    phone,
    role: "owner",
    ownerId: null,
    stationIds: [stationRef.id],
  });

  await stationRef.set({
    name: stationName,
    address,
    ownerId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { username, pin, uid, stationId: stationRef.id };
});

/* ------------------------------------------------------------------ */
/* createStaff — owner only, station must belong to them               */
/* ------------------------------------------------------------------ */

exports.createStaff = onCall(async (request) => {
  const ownerUid = assertOwner(request);

  const name = requireString(request.data?.name, "name");
  const phone = requireString(request.data?.phone, "phone", { max: 24 });
  const stationId = requireString(request.data?.stationId, "stationId");
  const role = requireString(request.data?.role, "role");

  if (role !== "manager" && role !== "attendant") {
    throw new HttpsError("invalid-argument", "Role must be manager or attendant.");
  }

  const stationSnap = await db.collection("stations").doc(stationId).get();
  if (!stationSnap.exists || stationSnap.get("ownerId") !== ownerUid) {
    throw new HttpsError("permission-denied", "That station is not yours.");
  }

  const { username, pin, uid } = await provisionAccount({
    name,
    phone,
    role,
    ownerId: ownerUid,
    stationIds: [stationId],
  });

  return { username, pin, uid, stationId };
});

/* ------------------------------------------------------------------ */
/* addStation — owner adds another station to their own account        */
/* ------------------------------------------------------------------ */

exports.addStation = onCall(async (request) => {
  const ownerUid = assertOwner(request);

  const name = requireString(request.data?.name, "name");
  const address = requireString(request.data?.address, "address", { max: 300 });

  const stationRef = db.collection("stations").doc();
  const batch = db.batch();
  batch.set(stationRef, {
    name,
    address,
    ownerId: ownerUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("users").doc(ownerUid), {
    stationIds: FieldValue.arrayUnion(stationRef.id),
  });
  await batch.commit();

  return { stationId: stationRef.id, name, address };
});

/* ------------------------------------------------------------------ */
/* pinLogin — public; the only path from a PIN to a Firebase session   */
/* ------------------------------------------------------------------ */

exports.pinLogin = onCall(async (request) => {
  const username = String(request.data?.username || "").trim().toLowerCase();
  const pin = String(request.data?.pin || "");

  // Deliberately vague message: never reveal which half was wrong.
  const bad = () => new HttpsError("unauthenticated", "Incorrect username or PIN.");

  if (!username || !/^\d{4}$/.test(pin)) throw bad();

  const attemptRef = db.collection("loginAttempts").doc(username);
  const attemptSnap = await attemptRef.get();
  const failedCount = attemptSnap.get("failedCount") || 0;
  const lastFailedAt = attemptSnap.get("lastFailedAt")?.toMillis?.() || 0;
  const withinWindow = Date.now() - lastFailedAt < LOCKOUT_MS;

  if (failedCount >= MAX_FAILED_LOGINS && withinWindow) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many failed attempts. Try again in a few minutes."
    );
  }

  const registerFailure = async () => {
    await attemptRef.set(
      {
        failedCount: withinWindow ? failedCount + 1 : 1,
        lastFailedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  };

  const usernameSnap = await db.collection("usernames").doc(username).get();
  if (!usernameSnap.exists) {
    await registerFailure();
    throw bad();
  }

  const uid = usernameSnap.get("uid");
  const secretSnap = await db.collection("authSecrets").doc(uid).get();
  const pinHash = secretSnap.get("pinHash");
  if (!pinHash || !(await bcrypt.compare(pin, pinHash))) {
    await registerFailure();
    throw bad();
  }

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) throw bad();

  await attemptRef.set(
    { failedCount: 0, lastSuccessAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const token = await auth.createCustomToken(uid);
  return {
    token,
    profile: {
      uid,
      name: userSnap.get("name"),
      role: userSnap.get("role"),
      username,
    },
  };
});
