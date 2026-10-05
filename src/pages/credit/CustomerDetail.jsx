import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { BackIcon } from "../../components/icons.jsx";
import Sheet from "../../components/Sheet.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import {
  addCustomerTransaction,
  archiveCustomer,
  listCustomers,
  readableError,
} from "../../lib/api";
import { formatDate, formatDayLabel, money, num, todayISO } from "../../lib/format";
import { statementReport } from "../../lib/export.js";
import { buildStatement, groupByDay, periodRange } from "../../lib/statement.js";
import { creditBase } from "./CreditList.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

const moneyInput = (v) =>
  String(v || "")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1")
    .replace(/^(\d+\.\d{0,2}).*$/, "$1");

/** How many entries the collapsed statement shows before "View full statement". */
const COLLAPSED = 10;

const PERIOD_CHIPS = [
  ["thisMonth", "credit.periodThisMonth"],
  ["lastMonth", "credit.periodLastMonth"],
  ["last3Months", "credit.periodLast3Months"],
  ["custom", "credit.periodCustom"],
];

const FILTER_CHIPS = [
  ["all", "credit.all"],
  ["payments", "credit.filterPayments"],
  ["credit", "credit.filterCredit"],
];

/**
 * One ledger line.
 *
 * Credit given is a debit (red, "+") because it grows what is owed; a payment
 * is a credit (green, "−"). The running balance sits under the amount so the
 * digits of both stay in the same right-aligned monospaced column.
 */
function StatementRow({ entry, t }) {
  const debit = entry.type === "credit";
  const description =
    entry.note || t(debit ? "credit.creditGivenOption" : "credit.paymentReceived");
  const sub = [entry.time, entry.recordedByName].filter(Boolean).join(" · ");
  return (
    <li className="st-row">
      <div className="st-row__main">
        <span className="st-row__desc">{description}</span>
        {sub && <span className="st-row__sub">{sub}</span>}
      </div>
      <div className="st-row__figures">
        <span className={`st-row__amt ${debit ? "is-debit" : "is-credit"}`}>
          {debit ? "+" : "−"}₹{money(entry.amount)}
        </span>
        <span className="st-row__bal">
          {t("credit.balanceShort", { amount: money(entry.balance) })}
        </span>
      </div>
    </li>
  );
}

/**
 * The statement body: pinned column header, opening balance, day-grouped
 * entries newest first, then the closing balance and period totals.
 */
function StatementBody({ statement, range, limit, t }) {
  const rows = limit ? statement.rows.slice(0, limit) : statement.rows;
  const groups = groupByDay(rows);
  return (
    <div className="statement__scroll">
      <div className="statement__cols">
        <span>{t("credit.colDetails")}</span>
        <span className="num">{t("credit.colAmount")}</span>
      </div>
      {statement.count === 0 ? (
        <p className="statement__empty muted">{t("credit.noTransactionsInPeriod")}</p>
      ) : (
        <>
          <div className="st-balance st-balance--opening">
            <span>
              {t("credit.openingBalance")}
              <small>{formatDate(range.from)}</small>
            </span>
            <span className="st-balance__v">₹{money(statement.opening)}</span>
          </div>
          {groups.map((group) => (
            <section className="st-group" key={group.day}>
              <h3 className="st-group__day">{formatDayLabel(group.day)}</h3>
              <ul className="st-group__rows">
                {group.rows.map((entry) => (
                  <StatementRow key={entry.id} entry={entry} t={t} />
                ))}
              </ul>
            </section>
          ))}
          <div className="st-balance st-balance--closing">
            <span>
              {t("credit.closingBalance")}
              <small>{formatDate(range.to)}</small>
            </span>
            <span className="st-balance__v">₹{money(statement.closing)}</span>
          </div>
          <dl className="st-totals">
            <div>
              <dt>{t("credit.totalCreditGiven")}</dt>
              <dd className="is-debit">₹{money(statement.totals.creditGiven)}</dd>
            </div>
            <div>
              <dt>{t("credit.totalPaymentsReceived")}</dt>
              <dd className="is-credit">₹{money(statement.totals.paymentsReceived)}</dd>
            </div>
            <div>
              <dt>{t("credit.netMovement")}</dt>
              <dd>
                {statement.totals.net < 0 ? "−" : "+"}₹
                {money(Math.abs(statement.totals.net))}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

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
  const [period, setPeriod] = useState("thisMonth"),
    [range, setRange] = useState(() => periodRange("thisMonth")),
    [filter, setFilter] = useState("all"),
    [fullOpen, setFullOpen] = useState(false);
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

  /*
   * Keep the route marked while it is mounted so the customer-specific mobile
   * shell spacing can clear the fixed tab bar. The route itself remains the
   * page scroll; the statement does not create a nested scroll viewport.
   */
  useEffect(() => {
    const main = document.querySelector(".main");
    main?.classList.add("main--fixed");
    return () => main?.classList.remove("main--fixed");
  }, []);

  const [run, busy, runError] = useRunner(async () => {
    await load();
  });
  const customer = customers.find((c) => c.id === customerId);
  const balance = Number(customer?.outstandingBalance || 0);
  const payment = sheet === "payment";
  const amount = num(tx.amount),
    after = payment ? balance - amount : balance + amount,
    valid = amount > 0 && (!payment || amount <= balance);
  const statement = useMemo(
    () => buildStatement({ transactions: customer?.transactions || [], range, filter }),
    [customer, range, filter]
  );
  const buildReport = useCallback(
    (exportRange) =>
      statementReport({
        customer: customer || {},
        range: exportRange || range,
        filter,
        stationName: station?.name || "",
      }),
    [customer, range, filter, station]
  );
  const pickPeriod = (next) => {
    setPeriod(next);
    setRange((current) => periodRange(next, new Date(), current));
  };
  const setCustomRange = (next) => {
    setPeriod("custom");
    setRange(next);
  };
  const notes = [
    "credit.noteSuggestionCash",
    "credit.noteSuggestionUpi",
    "credit.noteSuggestionNeft",
    "credit.noteSuggestionDiesel",
    "credit.noteSuggestionPetrol",
  ];
  const openSheet = (kind) => {
    setMenu(false);
    setSheet(kind);
    setTx({ amount: "", note: "", date: todayISO(), showDate: false });
  };
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

  const exportTools = (
    <ReportSheet
      report="statement"
      title={t("credit.statement")}
      label={t("credit.reportExport")}
      triggerClassName="tool-btn tool-btn--compact"
      stationName={station?.name || ""}
      range={range}
      onRangeChange={setCustomRange}
      buildReport={buildReport}
      note={customer.name}
    />
  );

  const periodControls = (
    <>
      <div className="statement__chips filter-chips" role="group">
        {PERIOD_CHIPS.map(([value, key]) => (
          <button
            type="button"
            key={value}
            className={period === value ? "active" : ""}
            aria-pressed={period === value}
            onClick={() => pickPeriod(value)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="statement__custom">
          <label className="field">
            <span>{t("report.from")}</span>
            <input
              type="date"
              className="mono"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => setCustomRange({ ...range, from: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("report.to")}</span>
            <input
              type="date"
              className="mono"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setCustomRange({ ...range, to: e.target.value })}
            />
          </label>
        </div>
      )}
      <div className="statement__chips filter-chips" role="group">
        {FILTER_CHIPS.map(([value, key]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <p className="statement__legend small muted">
        <span className="is-debit">{t("credit.legendDebit")}</span>
        <span className="is-credit">{t("credit.legendCredit")}</span>
      </p>
    </>
  );

  return (
    <div className="customer-screen">
      <ScreenHeader
        title={customer.name}
        sub={customer.phone || "—"}
        back={link(base)}
        actions={
          <button
            className="icon-btn"
            aria-label={t("credit.moreActions")}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            ⋯
          </button>
        }
      />
      <div className="customer-screen__body">
        {(error || runError) && <Notice kind="error">{error || runError}</Notice>}
        {success && <Notice kind="good">{success}</Notice>}
        {menu && (
          <div className="overflow-menu">
            <button type="button" onClick={archive}>
              {t("credit.archive")}
            </button>
          </div>
        )}

        {/* Balance plus the only two actions on the screen, above the fold. */}
        <section className={`balance-card${balance > 0 ? " balance-card--due" : ""}`}>
          <div className="balance-card__top">
            <div className="balance-card__figure">
              <span className="balance-card__label">
                {t("credit.outstandingBalance")}
              </span>
              <span className="balance-card__value mono">₹{money(balance)}</span>
            </div>
            <span className={`tag ${balance > 0 ? "rust" : "green"}`}>
              {balance > 0 ? t("credit.outstanding") : t("credit.settled")}
            </span>
          </div>
          <div className="balance-card__actions">
            <button
              type="button"
              className="cta credit-pay"
              onClick={() => openSheet("payment")}
            >
              {t("credit.receivePayment")}
            </button>
            <button
              type="button"
              className="cta credit-give"
              onClick={() => openSheet("credit")}
            >
              {t("credit.giveCredit")}
            </button>
          </div>
        </section>

        <section className="statement">
          <div className="statement__head">
            <h2>{t("credit.statement")}</h2>
            {exportTools}
          </div>
          {periodControls}
          <StatementBody statement={statement} range={range} limit={COLLAPSED} t={t} />
          {statement.count > COLLAPSED && (
            <button
              type="button"
              className="statement__more"
              onClick={() => setFullOpen(true)}
            >
              {t("credit.viewFullStatement", { count: statement.count })}
            </button>
          )}
        </section>
      </div>

      {fullOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="statement-full" role="dialog" aria-modal="true">
            <header className="statement-full__head">
              <button
                type="button"
                className="back-link"
                aria-label={t("common.back")}
                onClick={() => setFullOpen(false)}
              >
                <BackIcon size={19} />
              </button>
              <div className="statement-full__titles">
                <h1>{t("credit.fullStatement")}</h1>
                <span className="sub">{customer.name}</span>
              </div>
              {exportTools}
            </header>
            <div className="statement-full__body">
              {periodControls}
              <StatementBody statement={statement} range={range} limit={0} t={t} />
            </div>
          </div>,
          document.body
        )}

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
          {/* Sticky, so the keyboard can never bury the confirm button. */}
          <div className="transaction-sheet__confirm">
            <button className="cta" disabled={busy || !valid}>
              {busy
                ? t("credit.posting")
                : t(payment ? "credit.recordPayment" : "credit.recordCredit", {
                    amount: money(amount),
                  })}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
