#!/usr/bin/env node
/**
 * Creates a first owner, station, pumps, nozzles, tanks and opening prices so
 * a brand-new project is not an empty screen.
 *
 * This is a convenience for getting started and for your own testing. It is
 * NOT demo data: everything it writes is real, belongs to you, and is the
 * same shape the app writes itself. Adjust the constants below before running
 * it, or pass --dry-run first to see what it would create.
 *
 *   node scripts/seedStation.js --owner "Ravi Kumar" --station "Highway Fuels" --pin 4827
 *
 * Requires serviceAccountKey.json in the repo root, the same key used by
 * setAdminClaim.js. Delete that key when you are finished.
 *
 * Safe to re-run: it refuses to create a second owner with the same phone
 * number, so a repeated run will not silently duplicate a station.
 */

const path = require("path");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DRY_RUN = process.argv.includes("--dry-run");

const OWNER_NAME = arg("owner", "Station Owner");
const OWNER_PHONE = arg("phone", "9000000001");
const STATION_NAME = arg("station", "Main Station");
const STATION_ADDRESS = arg("address", "Set a real address in the app");
const PIN = arg("pin");

const PUMPS = 2;
const NOZZLES_PER_PUMP = [
  { fuelType: "Petrol", label: "MS" },
  { fuelType: "Diesel", label: "HSD" },
];
const TANKS = [
  { name: "Tank 1", fuelType: "Petrol", capacity: 20000, currentStock: 0 },
  { name: "Tank 2", fuelType: "Diesel", capacity: 30000, currentStock: 0 },
];
const OPENING_PRICES = { Petrol: 0, Diesel: 0 };

const WEAK = new Set(["0000", "1111", "1234", "2222", "3333", "4444", "9999"]);

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!PIN) {
  fail(
    "Pass a PIN for the owner: --pin 4827\n" +
      "  Choose it yourself and tell them; nothing here generates one."
  );
}
if (!/^\d{4}$/.test(PIN) || WEAK.has(PIN)) {
  fail("The PIN must be 4 digits and not an obvious one.");
}

const keyPath = path.resolve(process.cwd(), "serviceAccountKey.json");
let serviceAccount;
try {
  serviceAccount = require(keyPath);
} catch {
  fail(
    "serviceAccountKey.json not found in the repo root.\n" +
      "  Firebase console > Project settings > Service accounts > Generate new private key."
  );
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();
const { FieldValue } = admin.firestore;

/** Matches the username scheme used by provisionAccount in functions/index.js. */
function usernameFrom(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "owner"
  );
}

async function main() {
  console.log(`\nSeeding project: ${serviceAccount.project_id}`);
  console.log(`  owner    ${OWNER_NAME}`);
  console.log(`  station  ${STATION_NAME}`);
  console.log(`  pumps    ${PUMPS}, ${NOZZLES_PER_PUMP.length} nozzles each`);
  console.log(`  tanks    ${TANKS.map((t) => `${t.name} (${t.fuelType})`).join(", ")}`);

  if (DRY_RUN) {
    console.log("\n  --dry-run: nothing was written.\n");
    return;
  }

  const existing = await db
    .collection("users")
    .where("phone", "==", OWNER_PHONE)
    .limit(1)
    .get();
  if (!existing.empty) {
    fail(
      `An account already uses phone ${OWNER_PHONE}.\n` +
        "  Pass a different --phone, or delete that user first."
    );
  }

  let username = usernameFrom(OWNER_NAME);
  let n = 1;
  while ((await db.collection("usernames").doc(username).get()).exists) {
    username = `${usernameFrom(OWNER_NAME)}${++n}`;
  }

  const stationRef = db.collection("stations").doc();
  const user = await auth.createUser({ displayName: OWNER_NAME });

  await auth.setCustomUserClaims(user.uid, { role: "owner", ownerId: user.uid });

  const batch = db.batch();

  batch.set(db.collection("users").doc(user.uid), {
    name: OWNER_NAME,
    phone: OWNER_PHONE,
    role: "owner",
    ownerId: null,
    stationIds: [stationRef.id],
    username,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.collection("usernames").doc(username), { uid: user.uid });

  // Same cost factor the Cloud Functions use.
  batch.set(db.collection("authSecrets").doc(user.uid), {
    pinHash: bcrypt.hashSync(PIN, 10),
    setBy: "seedStation.js",
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(stationRef, {
    name: STATION_NAME,
    address: STATION_ADDRESS,
    ownerId: user.uid,
    state: "active",
    createdAt: FieldValue.serverTimestamp(),
  });

  for (let p = 1; p <= PUMPS; p++) {
    const pumpRef = stationRef.collection("pumps").doc();
    batch.set(pumpRef, {
      name: `Pump ${p}`,
      state: "active",
      createdAt: FieldValue.serverTimestamp(),
    });

    NOZZLES_PER_PUMP.forEach((nz) => {
      const nozzleRef = stationRef.collection("nozzles").doc();
      batch.set(nozzleRef, {
        pumpId: pumpRef.id,
        label: `Pump ${p} · ${nz.label}`,
        fuelType: nz.fuelType,
        lastReading: 0,
        state: "active",
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }

  TANKS.forEach((t) => {
    batch.set(stationRef.collection("tanks").doc(), {
      ...t,
      state: "active",
      temperatureC: null,
      waterCm: null,
      lastDipAt: null,
      lastDipBy: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Prices start at zero and must be set in the app before a shift can open.
  // Seeding a made-up rate would be worse than an obvious blank.
  Object.entries(OPENING_PRICES).forEach(([fuelType, price]) => {
    batch.set(stationRef.collection("prices").doc(), {
      fuelType,
      price,
      effectiveFrom: FieldValue.serverTimestamp(),
      effectiveTo: null,
      setBy: "seedStation.js",
    });
  });

  await batch.commit();

  console.log("\n  Created.\n");
  console.log(`  Sign in with username  ${username}`);
  console.log(`  PIN                    the one you passed`);
  console.log(`  Station id             ${stationRef.id}`);
  console.log(
    "\n  Set real fuel prices in Setup before opening a shift; they start at 0.\n"
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n  Failed:", err.message, "\n");
    process.exit(1);
  });
