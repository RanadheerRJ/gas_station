import { useCallback, useEffect, useState } from "react";
import { pinReady } from "../../components/PinField";
import { phoneProblem } from "../../lib/validate.js";
import {
  adminStationRegistry,
  createOwner,
  listOwnerStaff,
  listOwners,
  readableError,
} from "../../lib/api";

export const BLANK = {
  ownerName: "",
  stationName: "",
  phone: "",
  address: "",
  pin: "",
  confirmPin: "",
};

/**
 * The developer console's state: who exists, and the one form that creates a
 * new owner.
 *
 * The owner account is minted by the `accounts` Edge Function, so the only
 * thing this holds that cannot be re-read is the freshly chosen PIN — kept in
 * memory, never persisted, and dropped when the screen unmounts.
 */
export function useAdminConsole() {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  // null = the registry RPC is not reachable (not deployed, or a deploy raced
  // `supabase db push`); [] = genuinely no stations yet.
  const [registry, setRegistry] = useState(null);
  const [staffOpen, setStaffOpen] = useState(null);
  const [staff, setStaff] = useState({});
  const [resetting, setResetting] = useState(null);
  const [resettingStation, setResettingStation] = useState(null);

  const loadOwners = useCallback(async () => {
    setLoadingOwners(true);
    try {
      const [ownerRows, stations] = await Promise.all([
        listOwners().catch(() => null),
        adminStationRegistry().catch(() => null),
      ]);
      setOwners(ownerRows || []);
      setRegistry(stations);
    } finally {
      setLoadingOwners(false);
    }
  }, []);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  // Credentials live in component state only — leaving the page loses them,
  // which is the intent: the raw PIN is never recoverable.
  useEffect(() => () => setCredentials(null), []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const stationsFor = useCallback(
    (ownerUid) =>
      registry ? registry.filter((station) => station.ownerId === ownerUid) : null,
    [registry]
  );

  const toggleStaff = async (owner) => {
    if (staffOpen === owner.uid) {
      setStaffOpen(null);
      return;
    }
    setStaffOpen(owner.uid);
    // The entry appears only once the roster resolves, so the panel can tell
    // "still loading" from "genuinely no logins".
    if (staff[owner.uid]) return;
    try {
      const rows = await listOwnerStaff(owner);
      setStaff((s) => ({ ...s, [owner.uid]: { rows, error: "" } }));
    } catch (err) {
      setStaff((s) => ({
        ...s,
        [owner.uid]: { rows: [], error: readableError(err) },
      }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCredentials(null);
    setBusy(true);
    try {
      const res = await createOwner({
        ownerName: form.ownerName.trim(),
        stationName: form.stationName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        pin: form.pin,
      });
      setCredentials({ ...res, pin: form.pin, subject: form.ownerName.trim() });
      setForm(BLANK);
      await loadOwners();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const phoneKey = form.phone.trim() ? phoneProblem(form.phone.trim()) : null;
  const complete =
    form.ownerName.trim() &&
    form.stationName.trim() &&
    form.phone.trim() &&
    form.address.trim() &&
    !phoneKey &&
    pinReady(form.pin, form.confirmPin);

  const activeStations = registry
    ? registry.filter((station) => station.state === "active").length
    : null;

  return {
    form,
    setForm,
    set,
    busy,
    error,
    credentials,
    setCredentials,
    owners,
    loadingOwners,
    registry,
    staffOpen,
    staff,
    resetting,
    setResetting,
    resettingStation,
    setResettingStation,
    loadOwners,
    stationsFor,
    toggleStaff,
    submit,
    phoneKey,
    complete,
    activeStations,
  };
}
