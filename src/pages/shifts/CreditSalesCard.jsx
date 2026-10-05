import Money from "../../components/Money.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Credit taken during the shift. A sale against a known customer shows the
 * directory's name and number; a walk-in shows what was typed at the till.
 */
export default function CreditSalesCard({ creditSales, customers }) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush credit-sales-card">
      <div className="card__head">
        <h2>{t("shifts.creditSalesHeading")}</h2>
      </div>
      <table className="responsive-table">
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("common.phone")}</th>
            <th className="num">{t("common.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {creditSales.map((sale, index) => {
            const known = customers.find((c) => c.id === sale.customerId);
            const customerName = known?.name || sale.name || t("shifts.walkIn");
            return (
              <tr key={index} className="money-row money-row--credit">
                <td data-label={t("common.name")}>
                  <span className="credit-sale__identity">
                    <span>{customerName}</span>
                    <span className="money-credit-tag">
                      <span aria-hidden="true">◷</span>
                      {t("money.notCollected")}
                    </span>
                  </span>
                </td>
                <td data-label={t("common.phone")} className="mono small muted">
                  {sale.phone || known?.phone || "—"}
                </td>
                <td data-label={t("common.amount")} className="num">
                  <Money kind="credit" value={sale.amount} label={customerName} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
