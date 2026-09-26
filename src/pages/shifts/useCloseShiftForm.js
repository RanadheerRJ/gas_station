import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import {
  closeShift,
  listCustomerDirectory,
  listShifts,
  readableError,
  resubmitRejectedShift,
} from "../../lib/api";
import { num } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals, validateClosing } from "../../lib/shiftMath";
import { shiftPaths } from "./paths.js";
import { useDraft } from "../../state/useDraft.js";

/**
 * Everything the close-shift screen knows, minus the drawing.
 *
 * This is the state, the derived figures and the effects that were inline in
 * CloseShift.jsx: loading the shift and the customer directory, the six
 * drafts that keep counted work alive across a dead battery, seeding a
 * correction from the submitted figures, the running totals, and the submit
 * that turns all of it into one RPC call. The component consumes the result
 * and renders it; no validation rule, payload field or navigation target is
 * decided anywhere else.
 */
export function useCloseShiftForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { stationId, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);

  const [shift, setShift] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Everything typed here was read off a meter or counted at the till —
  // work that cannot be re-derived if the phone dies or the submit fails.
  // Drafts mirror it into localStorage, keyed per shift, until the close or
  // correction resubmission goes through.
  const [closings, setClosings, clearClosings] = useDraft(`close:${id}:readings`, {});
  const [creditSales, setCreditSales, clearCredit] = useDraft(`close:${id}:credit`, []);
  const [payments, setPayments, clearPayments] = useDraft(`close:${id}:payments`, {
    cash: "",
    card: "",
    upi: "",
    credit: "",
    other: "",
  });
  const [testing, setTesting, clearTesting] = useDraft(`close:${id}:testing`, {
    MS: "",
    HSD: "",
  });
  const [note, setNote, clearNote] = useDraft(`close:${id}:note`, "");
  const [editedExpenses, setEditedExpenses, clearEditedExpenses] = useDraft(
    `close:${id}:expenses`,
    []
  );
  // `useDraft` deliberately keeps partially corrected data on a refresh. This
  // ref only seeds fields from the rejected shift once, when no such draft is
  // present, rather than overwriting work the attendant has already typed.
  const correctionSeededFor = useRef("");
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A sent-back shift is corrected by its own attendant — or, when an owner
  // has reopened it, by that owner. Both get the same pre-filled form and
  // both resubmit through the one RPC that reconciles the whole shift.
  const isCorrection =
    shift?.status === SHIFT_STATUS.REJECTED &&
    ((profile.role === "attendant" && shift.userId === profile.uid) ||
      profile.role === "owner");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!stationId) return;
      setLoading(true);
      try {
        const [rows, directory] = await Promise.all([
          listShifts(stationId),
          listCustomerDirectory(stationId).catch(() => []),
        ]);
        if (cancelled) return;
        setShift(rows.find((s) => s.id === id) || null);
        setCustomers(directory);
        setLoadError("");
      } catch (err) {
        if (!cancelled) setLoadError(readableError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stationId, id]);

  // A shift that is positively known to be settled has no draft worth
  // keeping — someone else closed it, or an earlier submit landed after
  // all. A rejected shift is the exception: it is deliberately reopened for
  // its attendant to correct, so its locally saved corrections must survive.
  // A shift that merely FAILED to load is different: drafts stay because the
  // readings may still be needed once the network returns.
  useEffect(() => {
    if (
      loading ||
      !shift ||
      shift.status === SHIFT_STATUS.OPEN ||
      shift.status === SHIFT_STATUS.REJECTED
    )
      return;
    clearClosings();
    clearCredit();
    clearPayments();
    clearTesting();
    clearNote();
    clearEditedExpenses();
  }, [
    loading,
    shift,
    clearClosings,
    clearCredit,
    clearPayments,
    clearTesting,
    clearNote,
    clearEditedExpenses,
  ]);

  // Start a correction with the submitted values, so whoever is correcting
  // — the attendant, or an owner who reopened the shift — fixes the flagged
  // items rather than re-entering the whole shift.
  useEffect(() => {
    if (!isCorrection || correctionSeededFor.current === id) return;
    correctionSeededFor.current = id;

    setClosings((current) =>
      Object.keys(current).length > 0
        ? current
        : Object.fromEntries(
            shift.nozzles.map((nozzle) => [nozzle.nozzleId, nozzle.closingReading ?? ""])
          )
    );
    setCreditSales((current) =>
      current.length > 0
        ? current
        : (shift.creditSales || []).map((sale) => ({ ...sale }))
    );
    setPayments((current) =>
      Object.values(current).some((value) => value !== "")
        ? current
        : { cash: "", card: "", upi: "", credit: "", other: "", ...shift.payments }
    );
    setTesting((current) =>
      Object.values(current).some((value) => value !== "")
        ? current
        : { MS: "", HSD: "", ...shift.testing }
    );
    setNote((current) => (current !== "" ? current : shift.note || ""));
    setEditedExpenses((current) =>
      current.length > 0
        ? current
        : (shift.expenses || []).map((expense) => ({ ...expense }))
    );
  }, [
    id,
    isCorrection,
    setClosings,
    setCreditSales,
    setPayments,
    setTesting,
    setNote,
    setEditedExpenses,
    shift,
  ]);

  const withClosings = useMemo(
    () =>
      shift
        ? shift.nozzles.map((nozzle) => ({
            ...nozzle,
            closingReading: closings[nozzle.nozzleId] ?? "",
          }))
        : [],
    [shift, closings]
  );

  // Ordinary closes show the expenses recorded while the shift was open. A
  // sent-back shift lets its own attendant correct that list before it goes
  // back to review.
  const expenses = useMemo(
    () => (isCorrection ? editedExpenses : shift?.expenses || []),
    [isCorrection, editedExpenses, shift]
  );

  const preview = useMemo(
    () =>
      shiftTotals({
        nozzles: withClosings,
        expenses,
        creditSales,
        payments,
        testing,
      }),
    [withClosings, expenses, creditSales, payments, testing]
  );

  // Credit taken this shift is a payment mode too — keep the two in step so
  // the operator isn't asked for the same figure twice.
  const creditTotal = creditSales.reduce((sum, sale) => sum + num(sale.amount), 0);
  useEffect(() => {
    setPayments((current) => ({
      ...current,
      credit: creditTotal ? String(creditTotal) : "",
    }));
    // setPayments is a stable useState setter under the hood; listed only to
    // satisfy exhaustive-deps now that it comes from useDraft.
  }, [creditTotal, setPayments]);

  const submit = async () => {
    const found = validateClosing(withClosings);
    if (found.length) {
      setProblems(found);
      return;
    }
    setProblems([]);
    setBusy(true);
    setError("");
    try {
      const payload = {
        closingReadings: Object.fromEntries(
          withClosings.map((nozzle) => [nozzle.nozzleId, nozzle.closingReading])
        ),
        creditSales,
        payments,
        testing,
        note,
        expenses,
      };
      if (isCorrection) {
        await resubmitRejectedShift(stationId, shift.id, payload);
      } else {
        await closeShift(stationId, shift.id, payload);
      }
      // The figures are safely in the database — the drafts must go NOW,
      // before navigation, or they would greet the next visit to this URL.
      clearClosings();
      clearCredit();
      clearPayments();
      clearTesting();
      clearNote();
      clearEditedExpenses();
      // A corrected shift returns to its detail so the attendant can confirm
      // that it is back in the review queue. A newly closed shift still goes
      // home, where it sits in history.
      navigate(isCorrection ? paths.detail(shift.id) : paths.home, { replace: true });
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  };

  // Where the back arrow points while there is nothing to decide with yet:
  // the running shift for an attendant, the list otherwise.
  const fallbackBack = backTarget(paths, id);

  return {
    id,
    navigate,
    paths,
    shift,
    customers,
    loading,
    stationsLoading,
    loadError,
    isCorrection,
    closings,
    setClosings,
    creditSales,
    setCreditSales,
    payments,
    setPayments,
    testing,
    setTesting,
    note,
    setNote,
    setEditedExpenses,
    expenses,
    preview,
    problems,
    busy,
    error,
    submit,
    fallbackBack,
    // A correction returns to the shift's detail; an ordinary close goes back
    // where it came from.
    back: isCorrection ? paths.detail(id) : fallbackBack,
  };
}

/** Where the back arrow points: the running shift for an attendant, the list otherwise. */
export function backTarget(paths, id) {
  return paths.run ? paths.run(id) : paths.list;
}
