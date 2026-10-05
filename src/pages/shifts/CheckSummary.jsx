import Money from "../../components/Money.jsx";
import { num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The last look before the shift leaves the phone: every figure the submit
 * will carry, restated in plain words and the shared money colours — sales,
 * what was received, what is on credit (each customer the attendant
 * themselves entered), the expenses, and the counted cash.
 *
 * Everything here is the same preview the form already computes; nothing is
 * recalculated and nothing new is fetched.
 */
export default function CheckSummary({ preview, creditSales, payments }) {
  const { t } = useLanguage();
  const creditTotal = creditSales.reduce((sum, sale) => sum + num(sale.amount), 0);
  const walkInLabel = t("shifts.customerName");

  return (
    <section className="card check-summary" aria-labelledby="check-summary-title">
      <div className="card__head">
        <h2 id="check-summary-title">{t("close.checkTitle")}</h2>
        <span className="small muted">{t("close.checkHelp")}</span>
      </div>
      <dl className="check-summary__rows">
        <div className="check-summary__row">
          <dt>{t("shifts.fuelSold")}</dt>
          <dd data-testid="check-sales">
            <Money kind="neutral" value={preview.gross} label={t("shifts.fuelSold")} />
          </dd>
        </div>
        <div className="check-summary__row">
          <dt>{t("close.receivedLabel")}</dt>
          <dd data-testid="check-received">
            <Money
              kind="in"
              value={preview.declared ?? 0}
              label={t("close.receivedLabel")}
            />
          </dd>
        </div>
        <div className="check-summary__row">
          <dt>{t("close.onCredit")}</dt>
          <dd data-testid="check-credit">
            <Money kind="credit" value={creditTotal} label={t("close.onCredit")} />
          </dd>
        </div>
        {creditSales.length > 0 && (
          <ul className="check-summary__credit-lines" data-testid="check-credit-lines">
            {creditSales.map((sale, index) => (
              <li key={index}>
                <span>{sale.name || walkInLabel}</span>
                <Money
                  kind="credit"
                  value={sale.amount}
                  label={sale.name || walkInLabel}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="check-summary__row">
          <dt>{t("close.expensesLabel")}</dt>
          <dd data-testid="check-expenses">
            <Money
              kind="out"
              value={preview.expensesTotal}
              label={t("close.expensesLabel")}
            />
          </dd>
        </div>
        <div className="check-summary__row">
          <dt>{t("close.cashCounted")}</dt>
          <dd data-testid="check-cash">
            <Money
              kind="neutral"
              value={num(payments.cash)}
              label={t("close.cashCounted")}
            />
          </dd>
        </div>
      </dl>
    </section>
  );
}
