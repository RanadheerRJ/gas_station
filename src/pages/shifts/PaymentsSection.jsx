import { Field } from "../../components/ui.jsx";
import { CashIcon } from "../../components/icons.jsx";
import { PAYMENT_MODES } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { paymentLabel } from "./parts.jsx";

/**
 * What was actually collected, split by mode, plus the free-text note.
 * Credit is mirrored from the credit sales above and stays read-only so the
 * same figure is never asked for twice.
 */
export default function PaymentsSection({
  payments,
  setPayments,
  note,
  setNote,
  visibleModes = PAYMENT_MODES,
}) {
  const { t } = useLanguage();
  return (
    <section className="card">
      <div className="card__head">
        <h2>{t("shifts.whatCollected")}</h2>
        <CashIcon size={16} />
      </div>
      <div className="form-grid">
        {visibleModes.map((mode) => (
          <Field
            key={mode}
            label={paymentLabel(mode, t)}
            hint={mode === "credit" ? t("shifts.fromListAbove") : undefined}
          >
            <input
              className="mono"
              inputMode="decimal"
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
            onChange={(e) => setNote(e.target.value)}
            placeholder="Meter 2 sticking"
          />
        </Field>
      </div>
    </section>
  );
}
