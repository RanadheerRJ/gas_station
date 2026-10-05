import Money from "../../components/Money.jsx";
import { num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Fuel taken on credit during the shift, against a customer already in the
 * station's directory or a new walk-in. Credit posted from the running-shift
 * screen is loaded from the ledger and locked here so closing cannot post it
 * twice. A forgotten sale may still be added atomically at close. During a
 * rejected-shift correction the rows become editable and are reconciled by
 * the correction RPC.
 */
export default function CreditSection({
  creditSales,
  setCreditSales,
  customers,
  isCorrection = false,
}) {
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
            // Running-shift credit is already in the customer ledger. At an
            // ordinary close it is displayed and counted, never reposted or
            // silently changed. A rejected-shift correction may replace it.
            const locked = Boolean(row.transactionId) && !isCorrection;
            const patch = (fields) =>
              setCreditSales((rows) => {
                const next = [...rows];
                next[index] = { ...next[index], ...fields };
                return next;
              });
            return (
              <div
                key={row.transactionId || row.clientId || index}
                className="credit-row"
              >
                <select
                  value={row.customerId || ""}
                  disabled={locked}
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
                  disabled={locked || !!known}
                  placeholder={t("shifts.customerName")}
                  autoComplete="off"
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <input
                  className="mono"
                  inputMode="tel"
                  value={row.phone || ""}
                  disabled={locked || !!known}
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
                  disabled={locked}
                  placeholder="0.00"
                  onChange={(e) => patch({ amount: e.target.value })}
                  aria-label={t("common.amount")}
                />
                {!locked && (
                  <button
                    type="button"
                    className="quiet row-remove"
                    onClick={() =>
                      setCreditSales((rows) => rows.filter((_, j) => j !== index))
                    }
                  >
                    {t("common.remove")}
                  </button>
                )}
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
              {
                clientId: crypto.randomUUID(),
                customerId: "",
                name: "",
                phone: "",
                amount: "",
              },
            ])
          }
        >
          {t("shifts.addCreditSale")}
        </button>
      </div>
    </section>
  );
}
