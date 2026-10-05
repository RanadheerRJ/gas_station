import Money from "../../components/Money.jsx";
import { num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Fuel taken on credit during the shift, against a customer already in the
 * station's directory or a new walk-in. Everyone who can close a shift can
 * record credit, because it lands inside close_shift's single transaction
 * and still goes to the owner/manager for review. The subtotal shows as
 * credit money (amber), and the row add/remove controls are sized for a
 * thumb.
 */
export default function CreditSection({ creditSales, setCreditSales, customers }) {
  const { t } = useLanguage();
  const creditTotal = creditSales.reduce((sum, sale) => sum + num(sale.amount), 0);
  return (
    <section className="card" id="close-credit">
      <div className="card__head">
        <h2>{t("shifts.creditSales")}</h2>
        <Money kind="credit" value={creditTotal} label={t("shifts.creditSales")} />
      </div>
      <p className="section-help">{t("close.creditHelp")}</p>
      {creditSales.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          {t("common.none")}
        </p>
      ) : (
        <div className="stack section-pad">
          {creditSales.map((row, index) => {
            const known = customers.find((c) => c.id === row.customerId);
            const patch = (fields) =>
              setCreditSales((rows) => {
                const next = [...rows];
                next[index] = { ...next[index], ...fields };
                return next;
              });
            return (
              <div key={index} className="credit-row">
                <select
                  value={row.customerId || ""}
                  onChange={(e) => {
                    const chosen = customers.find((c) => c.id === e.target.value);
                    patch({
                      customerId: e.target.value,
                      name: chosen ? chosen.name : row.name,
                      phone: chosen ? chosen.phone || "" : row.phone,
                    });
                  }}
                >
                  <option value="">{t("shifts.newWalkIn")}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.name || ""}
                  disabled={!!known}
                  placeholder={t("shifts.customerName")}
                  autoComplete="off"
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <input
                  className="mono"
                  inputMode="tel"
                  value={row.phone || ""}
                  disabled={!!known}
                  placeholder={t("shifts.mobile")}
                  autoComplete="off"
                  onChange={(e) => patch({ phone: e.target.value })}
                />
                <input
                  className="mono input-xl"
                  inputMode="decimal"
                  autoComplete="off"
                  style={{ textAlign: "right" }}
                  value={row.amount}
                  placeholder="0.00"
                  onChange={(e) => patch({ amount: e.target.value })}
                  aria-label={t("common.amount")}
                />
                <button
                  type="button"
                  className="quiet row-remove"
                  onClick={() =>
                    setCreditSales((rows) => rows.filter((_, j) => j !== index))
                  }
                >
                  {t("common.remove")}
                </button>
              </div>
            );
          })}
          <div className="small muted">{t("shifts.walkInNote")}</div>
        </div>
      )}
      <div className="section-pad">
        <button
          type="button"
          className="small row-add"
          onClick={() =>
            setCreditSales((rows) => [
              ...rows,
              { customerId: "", name: "", phone: "", amount: "" },
            ])
          }
        >
          {t("shifts.addCreditSale")}
        </button>
      </div>
    </section>
  );
}
