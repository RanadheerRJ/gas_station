import { useStatusChange } from "../../components/motion.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { SHIFT_STATUS, PAYMENT_LABELS } from "../../lib/shiftMath";

/**
 * Payment modes and variance verdicts come out of the pure shiftMath module
 * as English words, because that module has no business knowing about the UI
 * language. Map them to dictionary keys here, at the edge that draws them.
 */
export const PAYMENT_KEY = {
  cash: "shifts.cash",
  card: "shifts.card",
  upi: "shifts.upi",
  credit: "shifts.creditMode",
  other: "shifts.otherMode",
};

export const VARIANCE_KEY = {
  balanced: "shifts.balanced",
  short: "shifts.short",
  excess: "shifts.excess",
  "not declared": "shifts.notDeclared",
};

/** The label for a payment mode, translated. */
export function paymentLabel(mode, translate) {
  return translate(PAYMENT_KEY[mode] || PAYMENT_LABELS[mode]);
}

/**
 * Small status chip for a settled shift.
 *
 * A shift moving from pending review to approved or sent back is the whole
 * point of the review flow, so the chip marks itself for one beat when the
 * status changes rather than silently swapping colour.
 */
export function StatusTag({ status, reopened = false }) {
  const { t } = useLanguage();
  const isReopened = status === SHIFT_STATUS.REJECTED && reopened;
  const changed = useStatusChange(`${status}:${isReopened}`);
  const state =
    status === SHIFT_STATUS.APPROVED
      ? "approved"
      : isReopened
        ? "reopened"
        : status === SHIFT_STATUS.REJECTED
          ? "sent-back"
          : "pending";
  const marker =
    state === "approved"
      ? "✓"
      : state === "reopened"
        ? "↻"
        : state === "sent-back"
          ? "↩"
          : "●";
  const label =
    state === "approved"
      ? t("shifts.approved")
      : state === "reopened"
        ? t("shifts.reopened")
        : state === "sent-back"
          ? t("shifts.sentBack")
          : t("shifts.pendingReview");
  return (
    <span
      className={`tag status-tag status-tag--${state}`}
      data-changed={changed || undefined}
    >
      <span aria-hidden="true">{marker}</span>
      {label}
    </span>
  );
}
