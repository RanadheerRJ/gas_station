/**
 * Cloud Functions (v2, callable) for the fuel station ledger platform.
 *
 * Account creation happens ONLY here, using the Admin SDK:
 *   createOwner  - developer/admin only
 *   createStaff  - owner only, for stations they own
 *   addStation   - owner only, for their own account
 *   resetPin     - developer resets an owner; owner resets their own staff
 *   pinLogin     - public; verifies a PIN and mints a custom auth token
 *
 * Raw PINs are never stored and never logged. Only a bcrypt hash lands in
 * Firestore, in a collection no client can read or write.
 */

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

/**
 * Rejected outright: four-of-a-kind, ascending/descending runs, and the
 * handful of PINs that dominate real-world breach data. A staff PIN guards
 * cash and stock figures, so "1234" is not acceptable even if chosen.
 */
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
  "1212", "1122", "6969", "1004", "2000", "2001", "1010",
]);

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Validate a caller-supplied PIN. The creator chooses it, so the rules are
 * enforced here rather than trusting the client form. Never logged, and never
 * echoed back in an error message.
 */
function validatePin(value, field = "pin") {
  const pin = String(value ?? "");
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new HttpsError(
      "invalid-argument",
      `The ${field} must be exactly ${PIN_LENGTH} digits.`
    );
  }
  if (WEAK_PINS.has(pin)) {
    throw new HttpsError(
      "invalid-argument",
      "That PIN is too easy to guess. Avoid repeated digits and simple runs."
    );
  }
  return pin;
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
 * The PIN is chosen by whoever is creating the account; only its bcrypt hash
 * is persisted. Returns { uid, username } — never the PIN, since the caller
 * already knows it.
 */
async function provisionAccount({ name, phone, role, ownerId, stationIds, pin }) {
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
      setBy: ownerId || uid,
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

  return { uid, username };
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
  const pin = validatePin(request.data?.pin);

  const stationRef = db.collection("stations").doc();

  const { uid, username } = await provisionAccount({
    name: ownerName,
    phone,
    role: "owner",
    ownerId: null,
    stationIds: [stationRef.id],
    pin,
  });

  await stationRef.set({
    name: stationName,
    address,
    ownerId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { username, uid, stationId: stationRef.id };
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
  const pin = validatePin(request.data?.pin);

  if (role !== "manager" && role !== "attendant") {
    throw new HttpsError("invalid-argument", "Role must be manager or attendant.");
  }

  const stationSnap = await db.collection("stations").doc(stationId).get();
  if (!stationSnap.exists || stationSnap.get("ownerId") !== ownerUid) {
    throw new HttpsError("permission-denied", "That station is not yours.");
  }

  const { username, uid } = await provisionAccount({
    name,
    phone,
    role,
    ownerId: ownerUid,
    stationIds: [stationId],
    pin,
  });

  return { username, uid, stationId };
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
/* resetPin — a creator rotates a subordinate's PIN                    */
/* ------------------------------------------------------------------ */

exports.resetPin = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError("unauthenticated", "Sign in first.");

  const targetUid = requireString(request.data?.uid, "uid");
  const pin = validatePin(request.data?.pin);

  const targetSnap = await db.collection("users").doc(targetUid).get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "That account does not exist.");
  }
  const target = targetSnap.data();

  // Authority runs strictly down the hierarchy: the developer may reset an
  // owner, an owner may reset their own staff. Nobody resets a peer, and
  // nobody resets upward.
  const isAdmin = caller.token?.admin === true;
  const isTheirOwner =
    caller.token?.role === "owner" &&
    target.role !== "owner" &&
    target.ownerId === caller.uid;

  if (!isAdmin && !isTheirOwner) {
    throw new HttpsError("permission-denied", "You cannot reset that account's PIN.");
  }

  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  await db.collection("authSecrets").doc(targetUid).set(
    {
      pinHash,
      setBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // A rotated PIN clears any active lockout so the user isn't locked out of
  // their own fresh credentials.
  if (target.username) {
    await db.collection("loginAttempts").doc(target.username).set(
      { failedCount: 0 },
      { merge: true }
    );
  }

  return { ok: true, username: target.username };
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
