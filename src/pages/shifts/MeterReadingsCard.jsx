import { money } from "../../lib/format";
import { fuelClass } from "../../lib/fuel.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Every nozzle's opening and closing reading, and what each one sold. */
export default function MeterReadingsCard({ totals }) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush">
      <div className="card__head">
        <h2>{t("shifts.meterReadings")}</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("shifts.nozzleCol")}</th>
            <th className="num">{t("shifts.opening")}</th>
            <th className="num">{t("shifts.closing")}</th>
            <th className="num">{t("shifts.litres")}</th>
            <th className="num">{t("shifts.price")}</th>
            <th className="num">{t("common.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {totals.lines.map((line) => (
            <tr key={line.nozzleId}>
              <td>
                <span className="row" style={{ gap: 6, alignItems: "center" }}>
                  <span className={`fuel-dot fuel-dot--${fuelClass(line.fuelType)}`} />
                  {line.label}
                </span>
              </td>
              <td className="num mono">{money(line.openingReading)}</td>
              <td className="num mono">{money(line.closingReading)}</td>
              <td className="num mono">{money(line.litresSold)}</td>
              <td className="num mono">{money(line.price)}</td>
              <td className="num mono">{money(line.revenue)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>{t("common.total")}</td>
            <td className="num mono">{money(totals.totalLitres)}</td>
            <td />
            <td className="num mono">{money(totals.gross)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="card__foot">
        <table>
          <tbody>
            <tr>
              <td>{t("shifts.msPetrol")}</td>
              <td className="num mono">{money(totals.litresByGroup.MS)} L</td>
            </tr>
            <tr>
              <td>{t("shifts.hsdDiesel")}</td>
              <td className="num mono">{money(totals.litresByGroup.HSD)} L</td>
            </tr>
            {totals.litresByGroup.OTHER > 0 && (
              <tr>
                <td>{t("shifts.other")}</td>
                <td className="num mono">{money(totals.litresByGroup.OTHER)} L</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
