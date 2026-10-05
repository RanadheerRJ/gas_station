import Money from "../../components/Money.jsx";
import VariancePill from "../../components/VariancePill.jsx";
import { Field } from "../../components/ui.jsx";
import { CashIcon } from "../../components/icons.jsx";
import { PAYMENT_MODES } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { paymentLabel } from "./parts.jsx";

/**
 * What was actually collected, split by mode, plus the free-text note.
 * Credit is mirrored from the credit sales above and stays read-only so the
 * same figure is never asked for twice.
 *
 * Beside the inputs, the cash answer is stated before it is asked for: the
 * running "cash you should hand over" figure, and once the counted cash is
 * typed, the verdict as a pill. Informational only — a difference is
 * sometimes the honest figure, and the note field can say why.
 */
export default function PaymentsSection({
  payments,
  setPayments,
  note,
  setNote,
  preview,
  visibleModes = PAYMENT_MODES,
}) {
  const { t } = useLanguage();
  return (
    <section className="card" id="close-payments">
      <div className="card__head">
        <h2>{t("shifts.whatCollected")}</h2>
        <CashIcon size={16} />
      </div>
      <p className="section-help">{t("close.paymentsHelp")}</p>
      <div className="form-grid">
        {visibleModes.map((mode) => (
          <Field
            key={mode}
            label={paymentLabel(mode, t)}
            hint={mode === "credit" ? t("shifts.fromListAbove") : undefined}
          >
            <input
              className="mono input-xl"
              inputMode="decimal"
              autoComplete="off"
              style={{ textAlign: "right" }}
              value={payments[mode]}
              readOnly={mode === "credit"}
              onChange={(e) =>
                setPayments((current) => ({ ...current, [mode]: e.target.value }))
              }
              placeholder="0.00"
            />
          </Field>
        ))}
        <Field label={t("common.note")} hint={t("common.optional")}>
          <input
            value={note}
            autoComplete="off"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Meter 2 sticking"
          />
        </Field>
      </div>
      <div className="cash-check">
        <div className="cash-check__figure">
          <span>{t("shifts.cashToHandOver")}</span>
          <Money
            kind="neutral"
            size="lg"
            value={preview.handover}
            label={t("shifts.cashToHandOver")}
          />
        </div>
        <VariancePill variance={payments.cash === "" ? null : preview.variance} />
      </div>
    </section>
  );
}
