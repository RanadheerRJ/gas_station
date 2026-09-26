import { money } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Credit taken during the shift. A sale against a known customer shows the
 * directory's name and number; a walk-in shows what was typed at the till.
 */
export default function CreditSalesCard({ creditSales, customers }) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush">
      <div className="card__head">
        <h2>{t("shifts.creditSalesHeading")}</h2>
      </div>
      <table>
        <tbody>
          {creditSales.map((sale, index) => {
            const known = customers.find((c) => c.id === sale.customerId);
            return (
              <tr key={index}>
                <td>{known?.name || sale.name || t("shifts.walkIn")}</td>
                <td className="mono small muted">{sale.phone || known?.phone || "—"}</td>
                <td className="num mono">{money(sale.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
