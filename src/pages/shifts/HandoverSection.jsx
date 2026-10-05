import Money from "../../components/Money.jsx";
import { money, num } from "../../lib/format";
import { VARIANCE_TOLERANCE } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The figure that matters at the counter: gross, less testing and expenses,
 * less what was settled without cash — ending in the cash to hand over and
 * how it compares with what was counted. Every figure renders through the
 * shared money language: deductions red, totals blue.
 */
export default function HandoverSection({ preview }) {
  const { t } = useLanguage();
  return (
    <section className="card handover" id="close-handover">
      <table>
        <tbody>
          <tr>
            <td>{t("shifts.fuelSold")}</td>
            <td className="num">
              <Money kind="neutral" value={preview.gross} label={t("shifts.fuelSold")} />
            </td>
          </tr>
          <tr>
            <td className="muted">{t("shifts.lessTesting")}</td>
            <td className="num">
              <Money
                kind="out"
                value={preview.testingTotal}
                label={t("shifts.lessTesting")}
              />
            </td>
          </tr>
          <tr>
            <td className="muted">{t("shifts.lessExpenses")}</td>
            <td className="num">
              <Money
                kind="out"
                value={preview.expensesTotal}
                label={t("shifts.lessExpenses")}
              />
            </td>
          </tr>
          <tr className="total">
            <td>{t("shifts.netDue")}</td>
            <td className="num">
              <Money
                kind="neutral"
                size="lg"
                value={preview.net}
                label={t("shifts.netDue")}
              />
            </td>
          </tr>
          <tr>
            <td className="muted">{t("shifts.lessNonCash")}</td>
            <td className="num">
              <Money kind="out" value={preview.nonCash} label={t("shifts.lessNonCash")} />
            </td>
          </tr>
          <tr className="total handover__cash">
            <td>{t("shifts.cashToHandOver")}</td>
            <td className="num">
              <Money
                kind="neutral"
                size="lg"
                value={preview.handover}
                label={t("shifts.cashToHandOver")}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="between handover__verdict">
        <span className="small muted">
          {t("shifts.countedAgainst", {
            counted: money(preview.declared ?? 0),
            due: money(preview.net),
          })}
        </span>
        <Verdict totals={preview} />
      </div>
    </section>
  );
}

export function Verdict({ totals }) {
  const { t } = useLanguage();
  const short = num(totals.variance) < -VARIANCE_TOLERANCE;
  const over = num(totals.variance) > VARIANCE_TOLERANCE;
  return (
    <span
      className="small mono"
      style={{
        color: short ? "var(--rust)" : over ? "var(--green)" : "var(--muted)",
        fontWeight: 650,
      }}
    >
      {short
        ? t("shifts.shortBy", { amount: money(Math.abs(totals.variance)) })
        : over
          ? t("shifts.overBy", { amount: money(totals.variance) })
          : t("shifts.balanced")}
    </span>
  );
}
