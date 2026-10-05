import Money from "../../components/Money.jsx";
import { Field } from "../../components/ui.jsx";
import { num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Fuel drawn for the daily calibration test and returned to the tank. It
 * left the nozzle but was never sold, so it comes off the gross before
 * anyone is asked to account for cash — stated in one plain sentence, with
 * the running deduction shown as spent money.
 */
export default function TestingSection({ testing, setTesting }) {
  const { t } = useLanguage();
  return (
    <section className="card" id="close-testing">
      <div className="card__head">
        <h2>{t("shifts.fuelTested")}</h2>
        <Money
          kind="out"
          value={num(testing.MS) + num(testing.HSD)}
          label={t("shifts.fuelTested")}
        />
      </div>
      <p className="section-help">{t("close.testingHelp")}</p>
      <div className="form-grid">
        <Field label={t("shifts.msPetrol")} hint="₹">
          <input
            className="mono input-xl"
            inputMode="decimal"
            autoComplete="off"
            style={{ textAlign: "right" }}
            value={testing.MS}
            placeholder="0.00"
            onChange={(e) => setTesting((prev) => ({ ...prev, MS: e.target.value }))}
          />
        </Field>
        <Field label={t("shifts.hsdDiesel")} hint="₹">
          <input
            className="mono input-xl"
            inputMode="decimal"
            autoComplete="off"
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
