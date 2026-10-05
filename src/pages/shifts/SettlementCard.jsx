import Money from "../../components/Money.jsx";
import { formatStamp } from "../../lib/format";
import { PAYMENT_MODES, varianceLabel } from "../../lib/shiftMath";
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
        <StatusTag status={shift.status} reopened={Boolean(shift.approvedAt)} />
      </div>
      <table className="money-table">
        <tbody>
          <tr className="money-row money-row--neutral">
            <td>{t("shifts.grossSales")}</td>
            <td className="num">
              <Money kind="neutral" value={draft.gross} label={t("shifts.grossSales")} />
            </td>
          </tr>
          <tr className="money-row money-row--out">
            <td className="muted">{t("shifts.testingMs")}</td>
            <td className="num">
              <Money kind="out" value={draft.testingMS} label={t("shifts.testingMs")} />
            </td>
          </tr>
          <tr className="money-row money-row--out">
            <td className="muted">{t("shifts.testingHsd")}</td>
            <td className="num">
              <Money kind="out" value={draft.testingHSD} label={t("shifts.testingHsd")} />
            </td>
          </tr>
          <tr className="money-row money-row--out">
            <td className="muted">{t("ledger.expenses")}</td>
            <td className="num">
              <Money
                kind="out"
                value={draft.expensesTotal}
                label={t("ledger.expenses")}
              />
            </td>
          </tr>
          <tr className="total money-row money-row--neutral">
            <td>{t("shifts.netDue")}</td>
            <td className="num">
              <Money kind="neutral" value={draft.net} label={t("shifts.netDue")} />
            </td>
          </tr>
          {PAYMENT_MODES.map((mode) => {
            const label = t(PAYMENT_KEY[mode]);
            return (
              <tr
                key={mode}
                className={`money-row money-row--${mode === "credit" ? "credit" : "in"}`}
              >
                <td className="muted">{label}</td>
                <td className="num">
                  <Money
                    kind={mode === "credit" ? "credit" : "in"}
                    value={draft.payments[mode]}
                    label={label}
                  />
                </td>
              </tr>
            );
          })}
          <tr className="total money-row money-row--neutral">
            <td>{t("shifts.collected")}</td>
            <td className="num">
              <Money
                kind="neutral"
                value={draft.declared}
                label={t("shifts.collected")}
              />
            </td>
          </tr>
          <tr className="money-row money-row--neutral">
            <td className="muted">{t("shifts.lessCardUpiCredit")}</td>
            <td className="num">
              <Money
                kind="neutral"
                value={draft.nonCash}
                label={t("shifts.lessCardUpiCredit")}
              />
            </td>
          </tr>
          <tr className="total money-row money-row--neutral">
            <td>{t("shifts.cashToOwner")}</td>
            <td className="num">
              <Money
                kind="neutral"
                value={draft.handover}
                label={t("shifts.cashToOwner")}
              />
            </td>
          </tr>
          <tr className="total money-row money-row--variance">
            <td>
              {t("shifts.varianceLabelled", {
                label: t(VARIANCE_KEY[varianceLabel(draft.variance)]),
              })}
            </td>
            <td className="num">
              <Money
                kind="variance"
                value={draft.variance}
                label={t("shifts.variance")}
              />
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
