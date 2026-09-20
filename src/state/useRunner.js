import { useCallback, useState } from "react";
import { readableError } from "../lib/api";

/**
 * The busy/error/reload plumbing every screen repeats around a mutation.
 *
 * `run(fn)` executes the mutation, reloads the screen's data on success and
 * reports a readable error on failure; it resolves to `true`/`false` so
 * callers can clear local form state only when the write actually landed.
 *
 * Kept as a hook (not baked into api.js) because reload behaviour — which
 * lists to refetch, which sheet to close — is a screen concern, and api.js
 * stays a pure data facade.
 */
export function useRunner(reload) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      setError("");
      try {
        await fn();
        if (reload) await reload();
        return true;
      } catch (err) {
        setError(readableError(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  return [run, busy, error];
}
