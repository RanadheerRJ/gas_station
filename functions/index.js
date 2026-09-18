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

/* ------------------------------------------------------------------ */
/* openShift / closeShift                                              */
/*                                                                     */
/* These run server-side because closing a shift must atomically       */
/* advance every nozzle's totaliser and post credit to customer        */
/* accounts. A partial write here would corrupt the next shift's       */
/* opening readings, so the whole thing is one transaction.            */
/* ------------------------------------------------------------------ */

/** Resolve the caller's access to a station from their claims. */
async function assertStationAccess(request, stationId) {
  const token = request.auth?.token;
  if (!token) throw new HttpsError("unauthenticated", "Sign in first.");

  if (token.role === "owner") {
    const snap = await db.collection("stations").doc(stationId).get();
    if (!snap.exists || snap.get("ownerId") !== token.ownerId) {
      throw new HttpsError("permission-denied", "That station is not yours.");
    }
    return;
  }
  if (token.stationId !== stationId) {
    throw new HttpsError("permission-denied", "You cannot act on that station.");
  }
}

/**
 * Set a price. Closes the previous active interval and opens a new one in a
 * single transaction, so there is never a gap or an overlap in the history.
 */
exports.setPrice = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  await assertStationAccess(request, stationId);
  if (request.auth?.token?.role !== "owner") {
    throw new HttpsError("permission-denied", "Only an owner can change prices.");
  }

  const fuelType = requireString(request.data?.fuelType, "fuelType", { max: 40 });
  const price = Number(request.data?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new HttpsError("invalid-argument", "Price must be a positive number.");
  }

  const pricesRef = db.collection("stations").doc(stationId).collection("prices");

  return db.runTransaction(async (tx) => {
    const activeSnap = await tx.get(
      pricesRef.where("fuelType", "==", fuelType).where("effectiveTo", "==", null)
    );
    const now = new Date().toISOString();
    activeSnap.forEach((d) => tx.update(d.ref, { effectiveTo: now }));

    const ref = pricesRef.doc();
    tx.set(ref, {
      stationId,
      fuelType,
      price,
      effectiveFrom: now,
      effectiveTo: null,
      setBy: request.auth.uid,
      setByName: request.auth.token.name || "",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, fuelType, price, effectiveFrom: now };
  });
});

exports.openShift = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  await assertStationAccess(request, stationId);

  const nozzleIds = Array.isArray(request.data?.nozzleIds) ? request.data.nozzleIds : [];
  if (nozzleIds.length === 0) {
    throw new HttpsError("invalid-argument", "Select at least one nozzle.");
  }

  const shiftsRef = db.collection("shifts").doc(stationId).collection("records");
  const stationRef = db.collection("stations").doc(stationId);

  return db.runTransaction(async (tx) => {
    // A nozzle may only be in one open shift, so several operators can work
    // different pumps at the same time without colliding.
    const openSnap = await tx.get(shiftsRef.where("status", "==", "open"));
    const busy = {};
    openSnap.forEach((d) => {
      (d.get("nozzles") || []).forEach((n) => {
        busy[n.nozzleId] = d.get("employeeName") || "another operator";
      });
    });
    const taken = nozzleIds.filter((id) => busy[id]);
    if (taken.length) {
      throw new HttpsError(
        "failed-precondition",
        `That nozzle is already in an active shift by ${busy[taken[0]]}.`
      );
    }

    const [pumpSnap, priceSnap] = await Promise.all([
      tx.get(stationRef.collection("pumps")),
      tx.get(stationRef.collection("prices").where("effectiveTo", "==", null)),
    ]);

    const pumpNames = {};
    pumpSnap.forEach((p) => {
      pumpNames[p.id] = p.get("name");
    });
    const activePrice = {};
    priceSnap.forEach((p) => {
      activePrice[p.get("fuelType")] = { id: p.id, price: p.get("price") };
    });

    const nozzleDocs = await Promise.all(
      nozzleIds.map((id) => tx.get(stationRef.collection("nozzles").doc(id)))
    );

    const nozzles = nozzleDocs.map((nz) => {
      if (!nz.exists) throw new HttpsError("not-found", "Nozzle not found.");
      const fuelType = nz.get("fuelType");
      const price = activePrice[fuelType];
      if (!price) {
        throw new HttpsError(
          "failed-precondition",
          `Set a price for ${fuelType} before starting a shift.`
        );
      }
      return {
        nozzleId: nz.id,
        pumpId: nz.get("pumpId"),
        label: `${pumpNames[nz.get("pumpId")] || "Pump"} · ${nz.get("name")}`,
        fuelType,
        openingReading: Number(nz.get("lastReading")) || 0,
        closingReading: "",
        // Snapshot the price so a later change never reprices this shift.
        price: Number(price.price),
        priceId: price.id,
      };
    });

    const ref = shiftsRef.doc();
    tx.set(ref, {
      employeeName: request.data?.employeeName || request.auth.token.name || "",
      userId: request.auth.uid,
      status: "open",
      date: new Date().toISOString().slice(0, 10),
      startTime: FieldValue.serverTimestamp(),
      endTime: null,
      openedByName: request.auth.token.name || "",
      closedByName: null,
      nozzles,
      expenses: [],
      creditSales: [],
      payments: { cash: "", card: "", upi: "", credit: "", other: "" },
      testing: { MS: "", HSD: "" },
      note: "",
    });
    return { shiftId: ref.id };
  });
});

exports.closeShift = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  const shiftId = requireString(request.data?.shiftId, "shiftId");
  await assertStationAccess(request, stationId);

  const payload = request.data || {};
  const shiftRef = db
    .collection("shifts")
    .doc(stationId)
    .collection("records")
    .doc(shiftId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(shiftRef);
    if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
    if (snap.get("status") !== "open") {
      throw new HttpsError("failed-precondition", "That shift is already closed.");
    }

    const closings = payload.closingReadings || {};
    const nozzles = (snap.get("nozzles") || []).map((n) => {
      const closing = Number(closings[n.nozzleId]);
      if (!Number.isFinite(closing)) {
        throw new HttpsError(
          "invalid-argument",
          `Closing reading missing for ${n.label}.`
        );
      }
      return { ...n, closingReading: closing };
    });

    const expenses = (payload.expenses || []).map((e) => ({
      label: String(e.label || "").trim(),
      amount: Number(e.amount) || 0,
    }));
    const creditSales = (payload.creditSales || []).map((c) => ({
      customerId: c.customerId || null,
      name: String(c.name || "").trim(),
      phone: String(c.phone || "").trim(),
      amount: Number(c.amount) || 0,
    }));

    // Firestore transactions require all reads before any write, so resolve
    // walk-in credit customers up front.
    const customersCol = db
      .collection("creditCustomers")
      .doc(stationId)
      .collection("customers");
    const newCustomers = [];

    for (const c of creditSales) {
      if (c.customerId) continue;
      if (c.phone) {
        // eslint-disable-next-line no-await-in-loop
        const match = await tx.get(customersCol.where("phone", "==", c.phone).limit(1));
        if (!match.empty) {
          c.customerId = match.docs[0].id;
          continue;
        }
      }
      const fresh = customersCol.doc();
      c.customerId = fresh.id;
      newCustomers.push({ ref: fresh, sale: c });
    }

    // ---- writes from here on ----

    // Every rupee of walk-in debt gets a named, auditable account.
    newCustomers.forEach(({ ref, sale }) => {
      tx.set(ref, {
        name: sale.name || "Walk-in",
        phone: sale.phone || "",
        outstandingBalance: 0,
        transactions: [],
        createdFromShift: shiftId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    // Advance only the nozzles this shift actually held.
    nozzles.forEach((n) => {
      tx.update(
        db.collection("stations").doc(stationId).collection("nozzles").doc(n.nozzleId),
        { lastReading: Number(n.closingReading) }
      );
    });

    creditSales.forEach((c) => {
      if (!c.customerId) return;
      const custRef = customersCol.doc(c.customerId);
      tx.set(
        custRef,
        {
          outstandingBalance: FieldValue.increment(c.amount),
          transactions: FieldValue.arrayUnion({
            date: snap.get("date"),
            type: "credit",
            amount: c.amount,
            note: `${snap.get("employeeName")} shift`,
          }),
        },
        { merge: true }
      );
    });

    const p = payload.payments || {};
    tx.update(shiftRef, {
      nozzles,
      expenses,
      creditSales,
      payments: {
        cash: Number(p.cash) || 0,
        card: Number(p.card) || 0,
        upi: Number(p.upi) || 0,
        credit: Number(p.credit) || 0,
        other: Number(p.other) || 0,
      },
      testing: {
        MS: Number(payload.testing?.MS) || 0,
        HSD: Number(payload.testing?.HSD) || 0,
      },
      note: String(payload.note || "").trim(),
      // Closing submits for review rather than finalising.
      status: "pending_review",
      endTime: FieldValue.serverTimestamp(),
      closedByName: request.auth.token.name || "",
    });

    return { ok: true, shiftId };
  });
});


/* ------------------------------------------------------------------ */
/* mid-shift nozzle changes                                            */
/* ------------------------------------------------------------------ */

exports.addNozzleToShift = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  const shiftId = requireString(request.data?.shiftId, "shiftId");
  const nozzleId = requireString(request.data?.nozzleId, "nozzleId");
  await assertStationAccess(request, stationId);

  const shiftRef = db.collection("shifts").doc(stationId).collection("records").doc(shiftId);
  const stationRef = db.collection("stations").doc(stationId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(shiftRef);
    if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
    if (snap.get("status") !== "open") {
      throw new HttpsError("failed-precondition", "Only an open shift can take more nozzles.");
    }
    const nozzles = snap.get("nozzles") || [];
    if (nozzles.some((n) => n.nozzleId === nozzleId)) {
      throw new HttpsError("failed-precondition", "That nozzle is already on this shift.");
    }

    const openSnap = await tx.get(
      db.collection("shifts").doc(stationId).collection("records").where("status", "==", "open")
    );
    let heldBy = null;
    openSnap.forEach((d) => {
      if (d.id === shiftId) return;
      if ((d.get("nozzles") || []).some((n) => n.nozzleId === nozzleId)) {
        heldBy = d.get("employeeName") || "another operator";
      }
    });
    if (heldBy) {
      throw new HttpsError("failed-precondition", `That nozzle is in an active shift by ${heldBy}.`);
    }

    const [nzDoc, pumpSnap, priceSnap] = await Promise.all([
      tx.get(stationRef.collection("nozzles").doc(nozzleId)),
      tx.get(stationRef.collection("pumps")),
      tx.get(stationRef.collection("prices").where("effectiveTo", "==", null)),
    ]);
    if (!nzDoc.exists) throw new HttpsError("not-found", "Nozzle not found.");

    const pumpNames = {};
    pumpSnap.forEach((p) => {
      pumpNames[p.id] = p.get("name");
    });
    let price = null;
    priceSnap.forEach((p) => {
      if (p.get("fuelType") === nzDoc.get("fuelType")) {
        price = { id: p.id, price: p.get("price") };
      }
    });
    if (!price) {
      throw new HttpsError(
        "failed-precondition",
        `Set a price for ${nzDoc.get("fuelType")} first.`
      );
    }

    tx.update(shiftRef, {
      nozzles: [
        ...nozzles,
        {
          nozzleId,
          pumpId: nzDoc.get("pumpId"),
          label: `${pumpNames[nzDoc.get("pumpId")] || "Pump"} · ${nzDoc.get("name")}`,
          fuelType: nzDoc.get("fuelType"),
          openingReading: Number(nzDoc.get("lastReading")) || 0,
          closingReading: "",
          price: Number(price.price),
          priceId: price.id,
          addedAt: new Date().toISOString(),
        },
      ],
    });
    return { ok: true };
  });
});

exports.removeNozzleFromShift = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  const shiftId = requireString(request.data?.shiftId, "shiftId");
  const nozzleId = requireString(request.data?.nozzleId, "nozzleId");
  await assertStationAccess(request, stationId);

  const shiftRef = db.collection("shifts").doc(stationId).collection("records").doc(shiftId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(shiftRef);
    if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
    if (snap.get("status") !== "open") {
      throw new HttpsError("failed-precondition", "Only an open shift can be changed.");
    }
    const nozzles = snap.get("nozzles") || [];
    if (nozzles.length <= 1) {
      throw new HttpsError("failed-precondition", "A shift needs at least one nozzle.");
    }
    tx.update(shiftRef, { nozzles: nozzles.filter((n) => n.nozzleId !== nozzleId) });
    return { ok: true };
  });
});

/* ------------------------------------------------------------------ */
/* shift review                                                        */
/* ------------------------------------------------------------------ */

exports.reviewShift = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  const shiftId = requireString(request.data?.shiftId, "shiftId");
  const action = requireString(request.data?.action, "action");
  await assertStationAccess(request, stationId);

  const role = request.auth?.token?.role;
  if (role !== "owner" && role !== "manager") {
    throw new HttpsError("permission-denied", "Only an owner or manager can review shifts.");
  }

  const shiftRef = db.collection("shifts").doc(stationId).collection("records").doc(shiftId);
  const snap = await shiftRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
  const status = snap.get("status");

  if (action === "approve") {
    if (status !== "pending_review" && status !== "rejected") {
      throw new HttpsError("failed-precondition", "Only a submitted shift can be approved.");
    }
    await shiftRef.update({
      status: "approved",
      approvedBy: request.auth.uid,
      approvedByName: request.auth.token.name || "",
      approvedAt: FieldValue.serverTimestamp(),
      rejectionReason: null,
    });
    return { ok: true, status: "approved" };
  }

  if (action === "reject") {
    if (status !== "pending_review") {
      throw new HttpsError("failed-precondition", "Only a submitted shift can be sent back.");
    }
    await shiftRef.update({
      status: "rejected",
      rejectedBy: request.auth.uid,
      rejectedByName: request.auth.token.name || "",
      rejectedAt: FieldValue.serverTimestamp(),
      rejectionReason: String(request.data?.reason || "").trim() || "Correction requested",
    });
    return { ok: true, status: "rejected" };
  }

  throw new HttpsError("invalid-argument", "Unknown review action.");
});

/**
 * Revise a shift that is still under review. Expenses, testing figures and
 * payments stay editable right up until an owner approves it.
 */
exports.reviseShift = onCall(async (request) => {
  const stationId = requireString(request.data?.stationId, "stationId");
  const shiftId = requireString(request.data?.shiftId, "shiftId");
  await assertStationAccess(request, stationId);

  const shiftRef = db.collection("shifts").doc(stationId).collection("records").doc(shiftId);
  const snap = await shiftRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
  if (snap.get("status") === "approved") {
    throw new HttpsError("failed-precondition", "An approved shift is locked.");
  }
  if (snap.get("status") === "open") {
    throw new HttpsError("failed-precondition", "Close the shift before revising it.");
  }

  const patch = {
    revisedBy: request.auth.uid,
    revisedByName: request.auth.token.name || "",
    revisedAt: FieldValue.serverTimestamp(),
  };
  if (Array.isArray(request.data?.expenses)) {
    patch.expenses = request.data.expenses.map((e) => ({
      label: String(e.label || "").trim(),
      amount: Number(e.amount) || 0,
    }));
  }
  if (request.data?.testing) {
    patch.testing = {
      MS: Number(request.data.testing.MS) || 0,
      HSD: Number(request.data.testing.HSD) || 0,
    };
  }
  if (request.data?.payments) {
    const p = request.data.payments;
    patch.payments = {
      cash: Number(p.cash) || 0,
      card: Number(p.card) || 0,
      upi: Number(p.upi) || 0,
      credit: Number(p.credit) || 0,
      other: Number(p.other) || 0,
    };
  }
  if (request.data?.note != null) patch.note = String(request.data.note).trim();
  // A rejected shift returns to the queue once the operator fixes it.
  if (snap.get("status") === "rejected") patch.status = "pending_review";

  await shiftRef.update(patch);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* deleteStation — owner only, permanent                               */
/* ------------------------------------------------------------------ */

exports.deleteStation = onCall(async (request) => {
  const ownerUid = assertOwner(request);
  const stationId = requireString(request.data?.stationId, "stationId");

  const stationRef = db.collection("stations").doc(stationId);
  const snap = await stationRef.get();
  if (!snap.exists || snap.get("ownerId") !== ownerUid) {
    throw new HttpsError("permission-denied", "That station is not yours.");
  }

  const openSnap = await db
    .collection("shifts")
    .doc(stationId)
    .collection("records")
    .where("status", "==", "open")
    .limit(1)
    .get();
  if (!openSnap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Close the open shift before deleting this station."
    );
  }

  // Recursively clear the station's subcollections, then the station itself.
  const subcollections = ["pumps", "nozzles", "prices"];
  for (const name of subcollections) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await stationRef.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(docs.docs.map((d) => d.ref.delete()));
  }
  for (const path of [
    db.collection("shifts").doc(stationId).collection("records"),
    db.collection("creditCustomers").doc(stationId).collection("customers"),
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await path.get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(docs.docs.map((d) => d.ref.delete()));
  }

  await stationRef.delete();
  await db
    .collection("users")
    .doc(ownerUid)
    .update({ stationIds: FieldValue.arrayRemove(stationId) });

  return { ok: true };
});
