import { money, num } from "../../lib/format";
import { litresBetween } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The closing totaliser reading for every nozzle on the shift, with the
 * litres each one implies as they are typed. A reading below its opening is
 * marked as it is entered; the blocking check still happens on submit.
 */
export default function NozzleReadingsSection({
  nozzles,
  closings,
  setClosings,
  preview,
}) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush">
      <div className="card__head">
        <h2>{t("shifts.closingReadings")}</h2>
        <span className="small muted mono">
          {money(preview.totalLitres)} L · ₹ {money(preview.gross)}
        </span>
      </div>
      <div>
        {nozzles.map((nozzle) => {
          const typed = closings[nozzle.nozzleId] ?? "";
          const litres =
            typed === "" ? null : litresBetween(nozzle.openingReading, typed);
          const below = typed !== "" && num(typed) < num(nozzle.openingReading);
          return (
            <div key={nozzle.nozzleId} className="closing-row">
              <span className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`} />
              <span className="closing-row__label">
                {nozzle.label}
                <span className="muted small">{nozzle.fuelType}</span>
              </span>
              <span className="closing-row__opening mono muted small">
                {money(nozzle.openingReading)}
              </span>
              <span className="closing-row__out mono small">
                {litres == null ? "—" : `${money(litres)} L`}
              </span>
              <input
                className={`mono closing-row__input${below ? " input-bad" : ""}`}
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={typed}
                onChange={(e) =>
                  setClosings((current) => ({
                    ...current,
                    [nozzle.nozzleId]: e.target.value,
                  }))
                }
                placeholder={money(nozzle.openingReading)}
                aria-label={`${nozzle.label} · ${t("shifts.closing")}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
