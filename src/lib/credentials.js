/**
 * Staff authenticate through Supabase Auth using a deterministic internal
 * email address. It is never shown or emailed; the visible credential remains
 * username + four-digit PIN. Supabase stores only a password hash.
 */
export function staffLoginEmail(username) {
  return `${String(username).trim().toLowerCase()}@station-ledger.invalid`;
}

export function staffPinPassword(username, pin) {
  return `station-ledger/${String(username).trim().toLowerCase()}/${String(pin)}`;
}
