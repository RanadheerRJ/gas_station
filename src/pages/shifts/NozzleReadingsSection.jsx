import { money, num } from "../../lib/format";
import { litresBetween } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Nozzle ids can be ids; ids in HTML must not be. */
const safeId = (value) => `close-${String(value).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;

/**
 * The closing totaliser reading for every nozzle on the shift, with the
 * litres each one implies as they are typed. One block per nozzle — fuel
 * named and coloured, the opening figure it started from, a big input for
 * the closing number, and the live "Sold" line beneath.
 *
 * A reading below its opening is flagged inline the moment it happens, in
 * plain words ("check the pump display") rather than a code; the blocking
 * check on submit is unchanged and lives in useCloseShiftForm.
 */
export default function NozzleReadingsSection({
  nozzles,
  closings,
  setClosings,
  preview,
  originals,
}) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush" id="close-readings">
      <div className="card__head">
        <h2>{t("shifts.closingReadings")}</h2>
        <span className="small muted mono">
          {money(preview.totalLitres)} L · ₹ {money(preview.gross)}
        </span>
      </div>
      <p className="section-help">{t("close.readingsHelp")}</p>
      <div>
        {nozzles.map((nozzle) => {
          const typed = closings[nozzle.nozzleId] ?? "";
          const litres =
            typed === "" ? null : litresBetween(nozzle.openingReading, typed);
          const below = typed !== "" && num(typed) < num(nozzle.openingReading);
          const inputId = safeId(nozzle.nozzleId);
          const errorId = `${inputId}-error`;
          // During a correction, a reading that no longer matches what was
          // submitted is highlighted, so the reviewer's "what changed" is
          // visible without comparing numbers by memory.
          const submitted = originals ? originals[nozzle.nozzleId] : undefined;
          const changed =
            submitted !== undefined &&
            submitted !== null &&
            typed !== "" &&
            typed !== String(submitted);
          return (
            <div
              key={nozzle.nozzleId}
              className="closing-row"
              data-bad={below ? "true" : undefined}
            >
              <div className="closing-row__head">
                <strong className="closing-row__name">{nozzle.label}</strong>
                <span className={`fuel-tag fuel-tag--${fuelClass(nozzle.fuelType)}`}>
                  {nozzle.fuelType}
                </span>
                {changed && (
                  <span className="changed-flag" title={t("close.edited")}>
                    ● {t("close.edited")}
                  </span>
                )}
              </div>
              <div className="closing-row__figures">
                <div className="closing-row__figure">
                  <span>{t("shifts.opening")}</span>
                  <strong className="mono">{money(nozzle.openingReading)}</strong>
                </div>
                <div className="closing-row__figure closing-row__figure--input">
                  <label htmlFor={inputId}>{t("shifts.closing")}</label>
                  <input
                    id={inputId}
                    className={`mono input-xl closing-row__input${below ? " input-bad" : ""}`}
                    inputMode="decimal"
                    autoComplete="off"
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
                    aria-invalid={below || undefined}
                    aria-describedby={below ? errorId : undefined}
                  />
                </div>
              </div>
              <p className="closing-row__sold">
                {litres == null ? "—" : t("close.soldLine", { litres: money(litres) })}
              </p>
              {below && (
                <p className="closing-row__error" id={errorId}>
                  <span aria-hidden="true">⚠</span>
                  {t("close.closingBelowOpening")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
