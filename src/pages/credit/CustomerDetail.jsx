import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import Sheet from "../../components/Sheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import {
  addCustomerTransaction,
  archiveCustomer,
  listCustomers,
  readableError,
} from "../../lib/api";
import { formatDate, money, num, todayISO } from "../../lib/format";
import { creditBase } from "./CreditList.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
const moneyInput = (v) =>
  String(v || "")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1")
    .replace(/^(\d+\.\d{0,2}).*$/, "$1");
export default function CustomerDetail() {
  const { t } = useLanguage(),
    { customerId } = useParams(),
    { profile } = useAuth(),
    { station, stationId, link, loading: stationsLoading } = useStation(),
    base = creditBase(profile.role);
  const [customers, setCustomers] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [sheet, setSheet] = useState(null),
    [menu, setMenu] = useState(false),
    [success, setSuccess] = useState("");
  const [tx, setTx] = useState({
    amount: "",
    note: "",
    date: todayISO(),
    showDate: false,
  });
  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      setCustomers(await listCustomers(stationId));
      setError("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, [stationId]);
  useEffect(() => {
    load();
  }, [load]);
  const [run, busy, runError] = useRunner(async () => {
    await load();
  });
  const customer = customers.find((c) => c.id === customerId);
  const balance = Number(customer?.outstandingBalance || 0);
  const payment = sheet === "payment";
  const amount = num(tx.amount),
    after = payment ? balance - amount : balance + amount,
    valid = amount > 0 && (!payment || amount <= balance);
  const notes = [
    "credit.noteSuggestionCash",
    "credit.noteSuggestionUpi",
    "credit.noteSuggestionNeft",
    "credit.noteSuggestionDiesel",
    "credit.noteSuggestionPetrol",
  ];
  const submit = async (e) => {
    e.preventDefault();
    if (!customer || !valid) return;
    const ok = await run(() =>
      addCustomerTransaction(stationId, customer.id, {
        date: tx.date,
        type: payment ? "payment" : "credit",
        amount,
        note: tx.note.trim(),
      })
    );
    if (ok) {
      setSheet(null);
      setTx({ amount: "", note: "", date: todayISO(), showDate: false });
      setSuccess(payment ? t("credit.receivePayment") : t("credit.giveCredit"));
      setTimeout(() => setSuccess(""), 2800);
    }
  };
  const archive = async () => {
    if (
      balance !== 0 &&
      !window.confirm(t("credit.archiveWarning", { amount: money(balance) }))
    )
      return;
    if (balance === 0 && !window.confirm(t("credit.archive"))) return;
    try {
      await archiveCustomer(customer.id);
      setMenu(false);
      await load();
    } catch (e) {
      setError(readableError(e));
    }
  };
  if (stationsLoading || loading)
    return (
      <>
        <ScreenHeader title={t("credit.title")} back={link(base)} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  if (error && !customer)
    return (
      <>
        <ScreenHeader title={t("credit.title")} back={link(base)} />
        <div className="content">
          <Notice kind="error">{error}</Notice>
        </div>
      </>
    );
  if (!customer)
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
  const transactions = customer.transactions || [];
  return (
    <>
      <ScreenHeader
        title={customer.name}
        sub={`${customer.phone || "—"}${station ? ` · ${station.name}` : ""}`}
        back={link(base)}
        actions={
          <button
            className="icon-btn"
            aria-label={t("credit.archive")}
            onClick={() => setMenu((v) => !v)}
          >
            ⋯
          </button>
        }
      />
      <div className="content stack">
        {(error || runError) && <Notice kind="error">{error || runError}</Notice>}
        {success && <Notice kind="good">{success}</Notice>}
        {menu && (
          <div className="overflow-menu">
            <button type="button" onClick={archive}>
              {t("credit.archive")}
            </button>
          </div>
        )}
        <section
          className={`card balance-hero${balance > 0 ? " balance-hero--due" : ""}`}
        >
          <span className="k">{t("credit.balanceIs")}</span>
          <span className="v mono">₹ {money(balance)}</span>
          <span className={`tag ${balance > 0 ? "rust" : "green"}`}>
            {balance > 0 ? t("credit.outstanding") : t("credit.settled")}
          </span>
        </section>
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
                  return transactions.map((row, i) => {
                    running += row.type === "credit" ? num(row.amount) : -num(row.amount);
                    return (
                      <tr key={row.id || i}>
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
                          ₹ {money(row.amount)}
                        </td>
                        <td data-label={t("credit.running")} className="num mono">
                          ₹ {money(running)}
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
          <div className="credit-action-buttons">
            <button
              className="cta credit-pay"
              onClick={() => {
                setSheet("payment");
                setTx({ ...tx, amount: "", date: todayISO() });
              }}
            >
              {t("credit.receivePayment")}
            </button>
            <button
              className="cta credit-give"
              onClick={() => {
                setSheet("credit");
                setTx({ ...tx, amount: "", date: todayISO() });
              }}
            >
              {t("credit.giveCredit")}
            </button>
          </div>
        </ActionBar>
      </div>
      <Sheet
        open={Boolean(sheet)}
        onClose={() => setSheet(null)}
        title={payment ? t("credit.receivePayment") : t("credit.giveCredit")}
      >
        <form className="transaction-sheet stack" onSubmit={submit}>
          <label className="amount-field">
            <span>₹</span>
            <input
              autoFocus
              inputMode="decimal"
              aria-label={t("common.amount")}
              value={tx.amount}
              onChange={(e) => setTx({ ...tx, amount: moneyInput(e.target.value) })}
              placeholder="0.00"
            />
          </label>
          <div className="quick-chips">
            {[500, 1000, 5000].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() =>
                  setTx({
                    ...tx,
                    amount: String((num(tx.amount) + n).toFixed(2).replace(/\.00$/, "")),
                  })
                }
              >
                {n === 500
                  ? t("credit.quick500")
                  : n === 1000
                    ? t("credit.quick1000")
                    : t("credit.quick5000")}
              </button>
            ))}
            {payment && (
              <button
                type="button"
                onClick={() => setTx({ ...tx, amount: String(balance) })}
              >
                {t("credit.fullBalance")}
              </button>
            )}
          </div>
          {payment && amount > balance && (
            <Notice kind="error">{t("credit.overpayment")}</Notice>
          )}
          <div className="sheet-preview">
            {t("credit.balanceAfter", { amount: money(after) })}
          </div>
          <div className="date-toggle">
            {tx.showDate ? (
              <input
                type="date"
                max={todayISO()}
                value={tx.date}
                onChange={(e) => setTx({ ...tx, date: e.target.value })}
              />
            ) : (
              <button type="button" onClick={() => setTx({ ...tx, showDate: true })}>
                {tx.date === todayISO() ? t("credit.todayChange") : formatDate(tx.date)}
              </button>
            )}
          </div>
          <label className="field">
            <span>
              {t("common.note")} <small>{t("common.optional")}</small>
            </span>
            <input
              value={tx.note}
              onChange={(e) => setTx({ ...tx, note: e.target.value })}
            />
          </label>
          <div className="quick-chips note-chips">
            {notes.map((k) => (
              <button type="button" key={k} onClick={() => setTx({ ...tx, note: t(k) })}>
                {t(k)}
              </button>
            ))}
          </div>
          <button className="cta" disabled={busy || !valid}>
            {busy
              ? t("credit.posting")
              : t(payment ? "credit.recordPayment" : "credit.recordCredit", {
                  amount: money(amount),
                })}
          </button>
        </form>
      </Sheet>
    </>
  );
}
