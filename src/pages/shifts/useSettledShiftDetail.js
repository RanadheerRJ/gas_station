import { useEffect, useMemo, useState } from "react";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";

/**
 * The reviewer's working copy of a settled shift.
 *
 * A reviewer may correct expenses and testing before signing off, send the
 * shift back with a reason, or (as the owner) reopen it. Each of those is a
 * small piece of local form state plus the "did the write land" handling
 * that decides whether to close the form — kept here so the breakdown itself
 * stays a drawing of numbers.
 */
export function useSettledShiftDetail({ shift, onRevise, onReject, onReopen }) {
  const locked = shift.status === SHIFT_STATUS.APPROVED;
  const [editing, setEditing] = useState(false);
  const [expenses, setExpenses] = useState(shift.expenses || []);
  const [testing, setTesting] = useState({
    MS: shift.testing?.MS ?? "",
    HSD: shift.testing?.HSD ?? "",
  });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  // Re-sync whenever the shift reloads under us.
  useEffect(() => {
    setExpenses(shift.expenses || []);
    setTesting({ MS: shift.testing?.MS ?? "", HSD: shift.testing?.HSD ?? "" });
    setEditing(false);
    setReopening(false);
    setReopenReason("");
  }, [shift]);

  const totals = useMemo(() => shiftTotals(shift), [shift]);
  const draft = useMemo(
    () => (editing ? shiftTotals({ ...shift, expenses, testing }) : totals),
    [editing, shift, expenses, testing, totals]
  );

  const submitRevision = async () => {
    const ok = await onRevise({ expenses, testing });
    if (ok) setEditing(false);
  };

  const submitRejection = async () => {
    const ok = await onReject(reason.trim());
    if (ok) {
      setReason("");
      setRejecting(false);
    }
  };

  // Reopening moves the shift into the sent-back correction state. The
  // reason is optional — the database records who reopened it either way.
  const submitReopen = async () => {
    const ok = await onReopen(reopenReason.trim());
    if (ok) {
      setReopenReason("");
      setReopening(false);
    }
  };

  /** Abandon an in-progress correction: back to the stored figures. */
  const cancelEditing = () => {
    setExpenses(shift.expenses || []);
    setTesting({
      MS: shift.testing?.MS ?? "",
      HSD: shift.testing?.HSD ?? "",
    });
    setEditing(false);
  };

  return {
    locked,
    editing,
    setEditing,
    expenses,
    setExpenses,
    testing,
    setTesting,
    rejecting,
    setRejecting,
    reason,
    setReason,
    reopening,
    setReopening,
    reopenReason,
    setReopenReason,
    totals,
    draft,
    submitRevision,
    submitRejection,
    submitReopen,
    cancelEditing,
  };
}
