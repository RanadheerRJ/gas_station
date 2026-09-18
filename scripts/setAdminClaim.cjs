#!/usr/bin/env node
/**
 * One-off: grant the developer account the { admin: true } custom claim.
 *
 * This is the only account the app does not create itself.
 *
 *   1. Firebase console > Authentication > Add user (email + password).
 *   2. Project settings > Service accounts > Generate new private key,
 *      save it as serviceAccountKey.json in the repo root (git-ignored).
 *   3. node scripts/setAdminClaim.cjs you@example.com
 *
 * The developer then signs into the app with that Firebase account. Owners,
 * managers and attendants use username + PIN instead.
 */

const path = require("path");
const admin = require("firebase-admin");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/setAdminClaim.cjs <developer-email>");
  process.exit(1);
}

const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.resolve(__dirname, "..", "serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Granted admin to ${email} (uid ${user.uid}).`);
    console.log("Sign out and back in for the new claim to reach the client.");
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();
