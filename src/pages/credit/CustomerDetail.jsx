import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Field, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import { addCustomerTransaction, listCustomers, readableError } from "../../lib/api";
import { formatDate, money, num, todayISO } from "../../lib/format";
import { creditBase } from "./CreditList.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * One account, one screen: the balance at the top, the full statement
 * beneath, and recording a credit or a payment as the pinned action. The
 * running balance column means a question like "when did they cross ₹10k?"
 * is answered by reading down the page.
 */
export default function CustomerDetail() {
  const { t } = useLanguage();
  const { customerId } = useParams();
  const { profile } = useAuth();
  const { station, stationId, link, loading: stationsLoading } = useStation();
  const base = creditBase(profile.role);

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tx, setTx] = useState({
    type: "credit",
    amount: "",
    note: "",
    date: todayISO(),
  });

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      setCustomers(await listCustomers(stationId));
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load]);

  const [run, busy, runError] = useRunner(load);

  const customer = customers.find((c) => c.id === customerId);
  const balance = Number(customer?.outstandingBalance || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!customer || !num(tx.amount)) return;
    const ok = await run(() =>
      addCustomerTransaction(stationId, customer.id, {
        date: tx.date,
        type: tx.type,
        amount: num(tx.amount),
        note: tx.note.trim(),
      })
    );
    if (ok) setTx({ type: "credit", amount: "", note: "", date: todayISO() });
  };

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("credit.title")} back={link(base)} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ScreenHeader title={t("credit.title")} back={link(base)} />
        <div className="content">
          <Notice kind="error">{error}</Notice>
        </div>
      </>
    );
  }

  if (!customer) {
    return (
      <>
        <ScreenHeader title={t("credit.title")} back={link(base)} />
        <div className="content">
          <div className="empty-card">
            <h2>{t("credit.customerNotFound")}</h2>
          </div>
        </div>
      </>
    );
  }

  const transactions = customer.transactions || [];

  return (
    <>
      <ScreenHeader
        title={customer.name}
        sub={`${customer.phone || "—"}${station ? ` · ${station.name}` : ""}`}
        back={link(base)}
      />
      <div className="content stack">
        {runError && <Notice kind="error">{runError}</Notice>}

        {/* ---- the balance ---- */}
        <section
          className={`card balance-hero${balance > 0 ? " balance-hero--due" : ""}`}
        >
          <span className="k">{t("credit.balanceIs")}</span>
          <span className="v mono">₹ {money(balance)}</span>
          {balance > 0 ? (
            <span className="tag rust">{t("credit.outstanding")}</span>
          ) : (
            <span className="tag green">{t("credit.settled")}</span>
          )}
        </section>

        {/* ---- record a credit or a payment ---- */}
        <section className="card">
          <div className="card__head">
            <h2>{t("credit.recordTransaction")}</h2>
          </div>
          <form
            id="customer-tx-form"
            className="stack"
            style={{ gap: 14 }}
            onSubmit={submit}
          >
            <div className="form-grid">
              <Field label={t("common.type")}>
                <select
                  value={tx.type}
                  onChange={(e) =>
                    setTx((current) => ({ ...current, type: e.target.value }))
                  }
                >
                  <option value="credit">{t("credit.creditGivenOption")}</option>
                  <option value="payment">{t("credit.paymentReceived")}</option>
                </select>
              </Field>
              <Field label={t("common.date")}>
                <input
                  type="date"
                  className="mono"
                  value={tx.date}
                  max={todayISO()}
                  onChange={(e) =>
                    setTx((current) => ({ ...current, date: e.target.value }))
                  }
                />
              </Field>
              <Field label={t("common.amount")}>
                <input
                  className="mono"
                  inputMode="decimal"
                  style={{ textAlign: "right" }}
                  value={tx.amount}
                  onChange={(e) =>
                    setTx((current) => ({ ...current, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </Field>
              <Field label={t("common.note")} hint={t("common.optional")}>
                <input
                  value={tx.note}
                  onChange={(e) =>
                    setTx((current) => ({ ...current, note: e.target.value }))
                  }
                  placeholder="Diesel 200L / NEFT"
                />
              </Field>
            </div>
          </form>
        </section>

        {/* ---- the statement ---- */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("credit.accountHistory")}</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="card__pad muted small">{t("credit.noTransactions")}</div>
          ) : (
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("common.type")}</th>
                  <th>{t("common.note")}</th>
                  <th className="num">{t("common.amount")}</th>
                  <th className="num">{t("credit.running")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  return transactions.map((row, index) => {
                    running += row.type === "credit" ? num(row.amount) : -num(row.amount);
                    return (
                      <tr key={index}>
                        <td data-label={t("common.date")} className="mono small">
                          {formatDate(row.date)}
                        </td>
                        <td data-label={t("common.type")}>
                          <span
                            className={`tag ${row.type === "credit" ? "rust" : "green"}`}
                          >
                            {row.type === "credit"
                              ? t("credit.creditGivenOption")
                              : t("credit.paymentReceived")}
                          </span>
                        </td>
                        <td data-label={t("common.note")} className="small">
                          {row.note || "—"}
                        </td>
                        <td data-label={t("common.amount")} className="num mono">
                          {money(row.amount)}
                        </td>
                        <td data-label={t("credit.running")} className="num mono">
                          {money(running)}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </section>

        <ActionBar>
          <button
            type="submit"
            className="cta"
            disabled={busy || !num(tx.amount)}
            form="customer-tx-form"
          >
            {busy ? t("credit.posting") : t("credit.postToAccount")}
          </button>
        </ActionBar>
      </div>
    </>
  );
}
