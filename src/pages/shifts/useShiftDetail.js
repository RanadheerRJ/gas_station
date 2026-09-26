import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import {
  approveShift,
  listCustomers,
  listShifts,
  readableError,
  rejectShift,
  reopenShiftForCorrection,
  reviseShift,
} from "../../lib/api";
import { SHIFT_STATUS } from "../../lib/shiftMath";
import { shiftPaths } from "./paths.js";

/**
 * Loading and permissions for one settled shift.
 *
 * Who may review it, who may resubmit a correction, who may reopen it, where
 * the back arrow points, and the four review mutations — all decided here so
 * the screen only has to draw the answer.
 */
export function useShiftDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { station, stationId, link, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);
  const canReview = profile.role === "owner" || profile.role === "manager";

  const [shifts, setShifts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      // The customer directory is a manager/owner read; an attendant's shift
      // shows credit sale names straight off the shift row instead.
      const [rows, directory] = await Promise.all([
        listShifts(stationId),
        profile.role === "attendant"
          ? Promise.resolve([])
          : listCustomers(stationId).catch(() => []),
      ]);
      setShifts(rows);
      setCustomers(directory);
      setLoadError("");
    } catch (err) {
      setLoadError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, profile.role]);

  useEffect(() => {
    load();
  }, [load]);

  const [run, busy, error] = useRunner(load);

  const shift = shifts.find((s) => s.id === id);
  // A sent-back shift belongs to its operator, who gets a direct, explicit
  // way into the correction form. An owner who reopens a closed shift gets
  // the same way in; managers keep only the review controls below.
  const canResubmit =
    shift?.status === SHIFT_STATUS.REJECTED &&
    ((profile.role === "attendant" && shift.userId === profile.uid) ||
      profile.role === "owner");
  // Reopening is the owner's alone: any closed shift — even an approved one —
  // can be pushed back into the correction state to be fixed end to end. It
  // never becomes a running shift again, so no nozzle is ever reclaimed.
  const canReopen =
    profile.role === "owner" &&
    (shift?.status === SHIFT_STATUS.PENDING_REVIEW ||
      shift?.status === SHIFT_STATUS.APPROVED);
  // Attendants reach a settled shift from their history list; managers and
  // owners from the shifts list. Either way, the back arrow points at the
  // list that led here.
  const back = link(paths.list);

  return {
    station,
    shift,
    customers,
    loading,
    stationsLoading,
    loadError,
    canReview,
    canResubmit,
    canReopen,
    correctionUrl: canResubmit ? link(paths.correct(shift.id)) : "",
    busy,
    error,
    back,
    onRevise: (patch) => run(() => reviseShift(stationId, shift.id, patch)),
    onReopen: (reason) =>
      run(() => reopenShiftForCorrection(stationId, shift.id, reason)),
    onApprove: () => run(() => approveShift(stationId, shift.id)),
    onReject: (reason) => run(() => rejectShift(stationId, shift.id, reason)),
  };
}
