import { Field } from "../../components/ui.jsx";
import { money, num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Fuel drawn for the daily calibration test and returned to the tank. It
 * left the nozzle but was never sold, so it comes off the gross before
 * anyone is asked to account for cash.
 */
export default function TestingSection({ testing, setTesting }) {
  const { t } = useLanguage();
  return (
    <section className="card">
      <div className="card__head">
        <h2>{t("shifts.fuelTested")}</h2>
        <span className="small muted">
          {t("shifts.backInTank")} · ₹ {money(num(testing.MS) + num(testing.HSD))}
        </span>
      </div>
      <div className="form-grid">
        <Field label={t("shifts.msPetrol")} hint="₹">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={testing.MS}
            placeholder="0.00"
            onChange={(e) => setTesting((prev) => ({ ...prev, MS: e.target.value }))}
          />
        </Field>
        <Field label={t("shifts.hsdDiesel")} hint="₹">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={testing.HSD}
            placeholder="0.00"
            onChange={(e) => setTesting((prev) => ({ ...prev, HSD: e.target.value }))}
          />
        </Field>
      </div>
    </section>
  );
}
