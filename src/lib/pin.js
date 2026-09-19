/**
 * PIN validation, shared by every screen that sets or changes one.
 *
 * This mirrors WEAK_PINS and validatePin in the accounts Edge Function. The
 * server is the authority — it re-validates every PIN it is given — but checking here
 * too means the user is told immediately instead of after a round trip.
 *
 * Keep the two lists in step. A PIN this file accepts and the server rejects
 * is a confusing error; the reverse is a security hole.
 */

const WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "2345",
  "3456",
  "4567",
  "5678",
  "6789",
  "0123",
  "9876",
  "8765",
  "7654",
  "6543",
  "5432",
  "4321",
  "3210",
  "1212",
  "1122",
  "6969",
  "1004",
  "2000",
  "2001",
  "1010",
]);

export function pinProblem(pin) {
  if (!/^\d{4}$/.test(String(pin ?? ""))) return "The PIN must be exactly 4 digits.";
  if (WEAK_PINS.has(String(pin)))
    return "That PIN is too easy to guess. Avoid repeated digits and simple runs.";
  return null;
}
