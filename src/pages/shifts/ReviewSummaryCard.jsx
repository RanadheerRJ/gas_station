import Money from "../../components/Money.jsx";
import { varianceLabel } from "../../lib/shiftMath.js";
import { useLanguage } from "../../state/LanguageContext.jsx";
import MoneyLegend from "./MoneyLegend.jsx";
import { PAYMENT_KEY, StatusTag } from "./parts.jsx";

const RECEIVED_MODES = ["cash", "card", "upi", "other"];

function Figure({ label, children, className = "" }) {
  return (
    <div className={`review-summary__figure ${className}`.trim()}>
      <span className="review-summary__label">{label}</span>
      <div className="review-summary__value">{children}</div>
    </div>
  );
}

function PaymentFigures({ payments, t }) {
  return (
    <div className="review-summary__breakdown">
      {RECEIVED_MODES.map((mode) => (
        <span key={mode} className="review-summary__breakdown-item">
          <span>{t(PAYMENT_KEY[mode])}</span>
          <Money
            kind="in"
            value={payments[mode]}
            label={t(PAYMENT_KEY[mode])}
            size="lg"
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Reviewer-only, plain-language view of the exact values returned by
 * shiftTotals. Payment methods and deductions stay split rather than being
 * totalled again in the component.
 */
export default function ReviewSummaryCard({ totals, shift }) {
  const { t } = useLanguage();
  const verdict = varianceLabel(totals.variance);
  const verdictKey =
    verdict === "balanced"
      ? "money.matches"
      : verdict === "short"
        ? "money.short"
        : verdict === "excess"
          ? "money.over"
          : "shifts.notDeclared";
  // `declared` is the existing payment-method total. Compare it directly to
  // the existing gross; no new tolerance or reconciliation arithmetic lives
  // in this presentation component.
  const reconciles = totals.declared != null && totals.declared === totals.gross;

  return (
    <section className="card review-summary" data-testid="review-summary">
      <div className="review-summary__head">
        <div>
          <h2>{t("money.approvingTitle")}</h2>
          <p>{t("money.approvingHelp")}</p>
        </div>
        <div className="review-summary__tools">
          <StatusTag status={shift.status} reopened={Boolean(shift.approvedAt)} />
          <MoneyLegend />
        </div>
      </div>

      <div className="review-summary__grid">
        <Figure label={t("money.totalSales")} className="review-summary__figure--sales">
          <Money
            kind="neutral"
            value={totals.gross}
            label={t("money.totalSales")}
            size="lg"
          />
        </Figure>

        <Figure
          label={t("money.receivedCashDigital")}
          className="review-summary__figure--received"
        >
          <PaymentFigures payments={totals.payments} t={t} />
        </Figure>

        <Figure
          label={t("money.givenOnCredit")}
          className="review-summary__figure--credit"
        >
          <Money
            kind="credit"
            value={totals.payments.credit}
            label={t("money.givenOnCredit")}
            size="lg"
          />
          <span className="money-credit-tag">
            <span aria-hidden="true">◷</span>
            {t("money.notCollected")}
          </span>
        </Figure>

        <Figure
          label={t("money.expensesTesting")}
          className="review-summary__figure--out"
        >
          <span className="review-summary__deduction">
            <span>{t("ledger.expenses")}</span>
            <Money
              kind="out"
              value={totals.expensesTotal}
              label={t("ledger.expenses")}
              size="lg"
            />
          </span>
          <span className="review-summary__deduction">
            <span>{t("shifts.testing")}</span>
            <Money
              kind="out"
              value={totals.testingTotal}
              label={t("shifts.testing")}
              size="lg"
            />
          </span>
        </Figure>

        <Figure
          label={t("money.cashExpectedCounted")}
          className="review-summary__figure--cash"
        >
          <div className="review-summary__cash-pair">
            <span>
              <small>{t("money.expected")}</small>
              <Money
                kind="neutral"
                value={totals.handover}
                label={t("money.cashExpected")}
                size="lg"
              />
            </span>
            <span>
              <small>{t("money.counted")}</small>
              <Money
                kind="in"
                value={totals.payments.cash}
                label={t("money.cashCounted")}
                size="lg"
              />
            </span>
          </div>
          <span className={`variance-pill variance-pill--${verdict.replace(" ", "-")}`}>
            <span>{t(verdictKey)}</span>
            <Money kind="variance" value={totals.variance} label={t("shifts.variance")} />
          </span>
        </Figure>
      </div>

      {reconciles && (
        <p className="review-summary__reconciles">{t("money.reconciliationCaption")}</p>
      )}
    </section>
  );
}
