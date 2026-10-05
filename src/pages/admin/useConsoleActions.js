import { useCallback, useState } from "react";
import {
  adminCreateStation,
  adminSetStationState,
  adminUpdateProfile,
  adminUpdateStation,
  deleteAccount,
  deleteStation,
  readableError,
} from "../../lib/api";

/**
 * Every write the developer console can make, behind one busy/error surface.
 *
 * Each action resolves to `true` or `false` so the caller can close its sheet
 * only when the write actually landed, and leaves behind a `done` note —
 * `{ key, params }`, translated by the screen — because a destructive action
 * that simply makes a row vanish gives no confirmation that the right thing
 * vanished.
 *
 * Deleting a station and deleting a login both go through the `accounts`
 * Edge Function: they need the service key to remove Auth users, which the
 * browser never holds. Everything else is an admin-only RPC.
 */
export function useConsoleActions(reload) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const run = useCallback(
    async (action, note) => {
      setBusy(true);
      setError("");
      setDone(null);
      try {
        await action();
        setDone(note || null);
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

  const stationName = (station) => station?.name || "";
  const stationKey = (station) => station?.stationId || station?.id;

  return {
    busy,
    error,
    done,
    setError,
    clearDone: () => setDone(null),

    createStation: (payload) =>
      run(() => adminCreateStation(payload), {
        key: "admin.stationCreated",
        params: { name: payload.name },
      }),

    updateStation: (station, patch) =>
      run(() => adminUpdateStation(stationKey(station), patch), {
        key: "admin.stationUpdated",
        params: { name: patch.name || stationName(station) },
      }),

    setStationState: (station, state) =>
      run(() => adminSetStationState(stationKey(station), state), {
        key: state === "archived" ? "admin.stationArchived" : "admin.stationActivated",
        params: { name: stationName(station) },
      }),

    removeStation: (station) =>
      run(() => deleteStation(stationKey(station)), {
        key: "admin.stationDeleted",
        params: { name: stationName(station) },
      }),

    updateAccount: (account, patch) =>
      run(() => adminUpdateProfile(account.uid, patch), {
        key: "admin.accountUpdated",
        params: { name: patch.name || account.name },
      }),

    removeAccount: (account) =>
      run(() => deleteAccount(account.uid), {
        key: "admin.accountDeleted",
        params: { name: account.name },
      }),
  };
}
