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
export function StatusTag({ status }) {
  const { t } = useLanguage();
  const changed = useStatusChange(status);
  const tone =
    status === SHIFT_STATUS.APPROVED
      ? " green"
      : status === SHIFT_STATUS.REJECTED
        ? " rust"
        : "";
  const label =
    status === SHIFT_STATUS.APPROVED
      ? t("shifts.approved")
      : status === SHIFT_STATUS.REJECTED
        ? t("shifts.sentBack")
        : t("shifts.pendingReview");
  return (
    <span className={`tag${tone}`} data-changed={changed || undefined}>
      {label}
    </span>
  );
}
