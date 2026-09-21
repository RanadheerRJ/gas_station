import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A useState that survives a dead battery.
 *
 * Closing a shift means walking pump to pump copying totaliser digits; a dip
 * means a wet stick read at arm's length. If the phone dies, the submit
 * fails, or the browser reclaims the tab before the operator taps save, that
 * typed work is gone and has to be walked again. `useDraft` mirrors the
 * state into localStorage so a reload picks up exactly where the thumb left
 * off — and leaves nothing behind once the form is submitted or abandoned
 * back to its initial value.
 *
 * Contract:
 *   - hydrates from storage on first render;
 *   - object drafts are PROJECTED onto the current initial shape, so a
 *     stale draft from an older build neither resurrects removed fields
 *     nor omits newly-added ones;
 *   - corrupt JSON or blocked storage falls back to `initial`, never throws;
 *   - the key is removed (not stored as noise) whenever the value equals
 *     `initial` again;
 *   - `clear()` removes the key synchronously and resets to `initial` —
 *     callers clear right before navigating away, when the state update may
 *     never render, so the storage side must not wait for an effect.
 */

const PREFIX = "petrav.draft.";
/* Drafts saved by the pre-rename build live under the old prefix. They are
   adopted on first read — and the legacy key removed — so a half-typed
   shift survives the upgrade exactly once, never to resurrect after a
   clear(). */
const LEGACY_PREFIX = "pumpmithra.draft.";

/** Plain data object — not an array, not null. */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fit a stored draft to the shape the form has TODAY: only fields present
 * in `initial` are copied over. Non-object values pass through unchanged.
 */
function project(stored, initial) {
  if (!isPlainObject(stored) || !isPlainObject(initial)) return stored;
  const out = { ...initial };
  Object.keys(initial).forEach((field) => {
    if (field in stored) out[field] = stored[field];
  });
  return out;
}

function read(storageKey, initial) {
  try {
    let raw = window.localStorage.getItem(storageKey);
    if (raw == null && storageKey.startsWith(PREFIX)) {
      const legacyKey = LEGACY_PREFIX + storageKey.slice(PREFIX.length);
      raw = window.localStorage.getItem(legacyKey);
      if (raw != null) {
        window.localStorage.setItem(storageKey, raw);
        window.localStorage.removeItem(legacyKey);
      }
    }
    if (raw == null) return initial;
    return project(JSON.parse(raw), initial);
  } catch {
    // Corrupt JSON, private mode, blocked storage — the draft is a
    // convenience, never worth crashing the form over.
    return initial;
  }
}

function remove(storageKey) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* storage blocked; nothing to clean up */
  }
}

export function useDraft(key, initial) {
  const storageKey = PREFIX + key;

  // The initial value is the reference point for "is there anything worth
  // keeping" — pin the first one so an inline object literal passed by the
  // caller does not become a new baseline every render.
  const initialRef = useRef(initial);
  const [value, setValue] = useState(() => read(storageKey, initialRef.current));

  useEffect(() => {
    // Back at the starting point (a submitted-and-reset form, an emptied
    // field) means there is no draft — remove the key rather than storing
    // a copy of the blank state.
    if (JSON.stringify(value) === JSON.stringify(initialRef.current)) {
      remove(storageKey);
      return;
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* storage full or blocked; typing still works, it just won't survive */
    }
  }, [storageKey, value]);

  const clear = useCallback(() => {
    // Synchronous on purpose: callers clear right before navigating away,
    // and a state update that never renders would leave the key behind if
    // removal were deferred to the persistence effect.
    remove(storageKey);
    setValue(initialRef.current);
  }, [storageKey]);

  return [value, setValue, clear];
}
