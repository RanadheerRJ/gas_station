import { formatStamp, money } from "../../lib/format";
import { PAYMENT_MODES, varianceLabel, varianceTone } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { PAYMENT_KEY, VARIANCE_KEY, StatusTag } from "./parts.jsx";

/**
 * The settlement walk: gross, what came off it, what was collected by mode,
 * and the variance the reviewer signs off against. Shows the live draft
 * while expenses and testing are being corrected.
 */
export default function SettlementCard({ shift, draft }) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush">
      <div className="card__head">
        <h2>{t("shifts.settlement")}</h2>
        <StatusTag status={shift.status} />
      </div>
      <table>
        <tbody>
          <tr>
            <td>{t("shifts.grossSales")}</td>
            <td className="num mono">{money(draft.gross)}</td>
          </tr>
          <tr>
            <td className="muted">{t("shifts.testingMs")}</td>
            <td className="num mono">−{money(draft.testingMS)}</td>
          </tr>
          <tr>
            <td className="muted">{t("shifts.testingHsd")}</td>
            <td className="num mono">−{money(draft.testingHSD)}</td>
          </tr>
          <tr>
            <td className="muted">{t("ledger.expenses")}</td>
            <td className="num mono">−{money(draft.expensesTotal)}</td>
          </tr>
          <tr className="total">
            <td>{t("shifts.netDue")}</td>
            <td className="num mono">{money(draft.net)}</td>
          </tr>
          {PAYMENT_MODES.map((mode) => (
            <tr key={mode}>
              <td className="muted">{t(PAYMENT_KEY[mode])}</td>
              <td className="num mono">{money(draft.payments[mode])}</td>
            </tr>
          ))}
          <tr className="total">
            <td>{t("shifts.collected")}</td>
            <td className="num mono">{money(draft.declared)}</td>
          </tr>
          <tr>
            <td className="muted">{t("shifts.lessCardUpiCredit")}</td>
            <td className="num mono">−{money(draft.nonCash)}</td>
          </tr>
          <tr className="total">
            <td>{t("shifts.cashToOwner")}</td>
            <td className="num mono">{money(draft.handover)}</td>
          </tr>
          <tr className="total">
            <td>
              {t("shifts.varianceLabelled", {
                label: t(VARIANCE_KEY[varianceLabel(draft.variance)]),
              })}
            </td>
            <td
              className="num mono"
              style={{
                color:
                  varianceTone(draft.variance) === "neg" ? "var(--rust)" : "var(--green)",
              }}
            >
              {money(draft.variance)}
            </td>
          </tr>
        </tbody>
      </table>
      {(shift.note || shift.endTime) && (
        <div className="card__foot small">
          {shift.note && (
            <div>
              <span className="muted">{t("shifts.noteLabel")} </span>
              {shift.note}
            </div>
          )}
          <div className="muted">
            {t("shifts.closedByLine", {
              who: shift.closedByName || shift.employeeName,
            })}
            {shift.endTime ? ` · ${formatStamp(shift.endTime)}` : ""}
            {shift.revisedByName
              ? ` · ${t("shifts.revisedBy", { who: shift.revisedByName })}`
              : ""}
          </div>
        </div>
      )}
    </section>
  );
}
