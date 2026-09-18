import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Firebase is the only backend. Without configuration the app cannot do
 * anything useful, so this is surfaced as a setup error on the login screen
 * rather than letting every call fail with a confusing SDK message.
 */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

/**
 * Point the SDK at the local emulator suite instead of the real project.
 *
 * This is opt-in via VITE_USE_EMULATORS rather than inferred from DEV mode:
 * developing against real data is a legitimate thing to do, and silently
 * redirecting it based on the build mode would be a nasty surprise. The
 * emulator still needs the config above, but the values can be dummies.
 */
const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

let app = null;
let auth = null;
let db = null;
let functions = null;

if (firebaseConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || "us-central1");

  if (useEmulators) {
    // Ports match the emulators block in firebase.json.
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
}

export { app, auth, db, functions, useEmulators };
