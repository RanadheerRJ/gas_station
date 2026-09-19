import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import { LoadingPanels, NumberRoll, useAnimatedList } from "../components/motion.jsx";
import StationPicker from "../components/StationPicker";
import { useStations } from "../state/useStations";
import {
  addCustomerTransaction,
  createCustomer,
  listCustomers,
  readableError,
} from "../lib/api";
import { formatDate, money, num, todayISO } from "../lib/format";
import ReportTools from "../components/ReportTools.jsx";
import { creditReport, defaultRange, filterByRange } from "../lib/export.js";
import { useLanguage } from "../state/LanguageContext.jsx";

export default function CreditCustomers() {
  const { t } = useLanguage();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();
  const [stationId, setStationId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [tx, setTx] = useState({
    type: "credit",
    amount: "",
    note: "",
    date: todayISO(),
  });
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState(() => defaultRange());

  useEffect(() => {
    if (stations.length === 0) return;
    const wanted = params.get("station");
    const valid = stations.find((s) => s.id === wanted);
    setStationId(valid ? valid.id : stations[0].id);
  }, [stations, params]);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const rows = await listCustomers(stationId);
      rows.sort(
        (a, b) => Number(b.outstandingBalance || 0) - Number(a.outstandingBalance || 0)
      );
      setCustomers(rows);
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

  const totalOutstanding = customers.reduce(
    (n, c) => n + Number(c.outstandingBalance || 0),
    0
  );
  const settled = customers.filter((c) => Number(c.outstandingBalance || 0) <= 0).length;

  // Keeps a removed customer mounted long enough to collapse out of the table.
  const customerRows = useAnimatedList(customers);

  // Transactions of the open account, narrowed to the report window so the
  // drawer and the export agree on what "in range" means.
  const visibleTransactions = useMemo(
    () =>
      filterByRange(
        selected?.transactions || [],
        range,
        (tx) => tx.date || tx.recordedAt
      ),
    [selected, range]
  );

  // How many rows an export would write: a customer with no movement still
  // contributes their balance line.
  const exportRowCount = useMemo(
    () => creditReport({ customers, range, stationName: "" }).rows.length,
    [customers, range]
  );

  const addCustomer = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createCustomer(stationId, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
      });
      setNewCustomer({ name: "", phone: "" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const postTransaction = async (e) => {
    e.preventDefault();
    if (!selected || !num(tx.amount)) return;
    setBusy(true);
    try {
      // The callable returns a receipt, not the customer document; the
      // reload below is what refreshes the drawer via the sync effect.
      await addCustomerTransaction(stationId, selected.id, {
        date: tx.date,
        type: tx.type,
        amount: num(tx.amount),
        note: tx.note.trim(),
      });
      setTx({ type: "credit", amount: "", note: "", date: todayISO() });
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  // Keep the open drawer in sync with reloaded data.
  useEffect(() => {
    if (!selected) return;
    const fresh = customers.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Credit customers" />
        <div className="content">
          <LoadingPanels count={1} lines={2} />
        </div>
      </>
    );
  }

  const station = stations.find((s) => s.id === stationId);

  return (
    <>
      <PageHeader
        title={t("credit.title")}
        sub={station?.name}
        actions={
          <button type="button" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? t("common.cancel") : t("credit.addCustomer")}
          </button>
        }
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title={t("common.station")}>
            <StationPicker
              stations={stations}
              value={stationId}
              onChange={(id) => {
                setSelected(null);
                setParams({ station: id });
              }}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        <Panel title={t("report.title")} note={t("report.note")}>
          <ReportTools
            report="credit"
            title="Credit customers"
            stationName={station?.name || ""}
            range={range}
            onRangeChange={setRange}
            rowCount={exportRowCount}
            buildReport={() =>
              creditReport({ customers, range, stationName: station?.name || "" })
            }
          />
        </Panel>

        <Panel title={t("credit.outstandingPosition")}>
          <div className="row" style={{ gap: 40 }}>
            <Stat
              label={t("credit.totalOutstanding")}
              amount={totalOutstanding}
              format={money}
              prefix="₹ "
              tone={totalOutstanding > 0 ? "neg" : "pos"}
            />
            <Stat
              label={t("credit.customers")}
              amount={customers.length}
              format={(n) => String(Math.round(n))}
            />
            <Stat
              label={t("credit.fullySettled")}
              amount={settled}
              format={(n) => String(Math.round(n))}
              tone="pos"
            />
          </div>
        </Panel>

        {showAdd && (
          <Panel title={t("credit.newCustomer")}>
            <form className="stack" onSubmit={addCustomer}>
              <div className="form-grid">
                <Field label={t("credit.customerName")}>
                  <input
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((c) => ({ ...c, name: e.target.value }))
                    }
                    placeholder="Sri Balaji Transports"
                  />
                </Field>
                <Field label={t("common.phone")}>
                  <input
                    className="mono"
                    inputMode="tel"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer((c) => ({ ...c, phone: e.target.value }))
                    }
                    placeholder="+91 90101 22334"
                  />
                </Field>
              </div>
              <div>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !newCustomer.name.trim()}
                >
                  {busy ? t("common.saving") : t("credit.addCustomer")}
                </button>
              </div>
            </form>
          </Panel>
        )}

        <Panel title={t("credit.balances")} flush>
          {loading ? (
            <LoadingPanels count={2} lines={3} label={t("common.loading")} />
          ) : customers.length === 0 ? (
            <Empty>{t("credit.empty")}</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("credit.customer")}</th>
                  <th>{t("common.phone")}</th>
                  <th className="num">{t("credit.creditGiven")}</th>
                  <th className="num">{t("credit.payments")}</th>
                  <th className="num">{t("credit.balance")}</th>
                  <th>{t("common.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customerRows.map(({ item: c, exiting }) => {
                  const txs = c.transactions || [];
                  const given = txs
                    .filter((t) => t.type === "credit")
                    .reduce((n, t) => n + num(t.amount), 0);
                  const paid = txs
                    .filter((t) => t.type === "payment")
                    .reduce((n, t) => n + num(t.amount), 0);
                  const bal = Number(c.outstandingBalance || 0);
                  return (
                    <tr key={c.id} className={exiting ? "row-exit" : "row-enter"}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="mono small">{c.phone || "—"}</td>
                      <td className="num mono">{money(given)}</td>
                      <td className="num mono">{money(paid)}</td>
                      <td
                        className="num mono"
                        style={{ color: bal > 0 ? "var(--rust)" : "var(--green)" }}
                      >
                        <NumberRoll value={bal} format={money} />
                      </td>
                      <td>
                        {bal > 0 ? (
                          <span className="tag rust">{t("credit.outstanding")}</span>
                        ) : (
                          <span className="tag green">{t("credit.settled")}</span>
                        )}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => setSelected(selected?.id === c.id ? null : c)}
                        >
                          {selected?.id === c.id ? t("common.close") : t("common.open")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{t("credit.totalOutstanding")}</td>
                  <td className="num mono">{money(totalOutstanding)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>

        {selected && (
          <Panel
            title={t("credit.account", { name: selected.name })}
            note={`${t("credit.balanceIs")} ₹ ${money(selected.outstandingBalance)}`}
          >
            <div className="row" style={{ gap: 24, alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                <div className="panel flush">
                  <table>
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
                      {visibleTransactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="muted small">
                            {(selected.transactions || []).length === 0
                              ? t("credit.noTransactions")
                              : t("credit.noTransactionsInRange")}
                          </td>
                        </tr>
                      )}
                      {(() => {
                        let running = 0;
                        return visibleTransactions.map((row, i) => {
                          running +=
                            row.type === "credit" ? num(row.amount) : -num(row.amount);
                          return (
                            <tr key={i}>
                              <td className="mono small">{formatDate(row.date)}</td>
                              <td>
                                <span
                                  className={`tag ${row.type === "credit" ? "rust" : "green"}`}
                                >
                                  {row.type === "credit"
                                    ? t("credit.creditGivenOption")
                                    : t("credit.paymentReceived")}
                                </span>
                              </td>
                              <td className="small">{row.note || "—"}</td>
                              <td className="num mono">{money(row.amount)}</td>
                              <td className="num mono">{money(running)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <form
                className="stack"
                onSubmit={postTransaction}
                style={{ flex: "0 1 260px", minWidth: 240 }}
              >
                <h3>{t("credit.recordTransaction")}</h3>
                <Field label={t("common.type")}>
                  <select
                    value={tx.type}
                    onChange={(e) => setTx((t) => ({ ...t, type: e.target.value }))}
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
                    onChange={(e) => setTx((t) => ({ ...t, date: e.target.value }))}
                  />
                </Field>
                <Field label={t("common.amount")}>
                  <input
                    className="mono"
                    inputMode="decimal"
                    value={tx.amount}
                    onChange={(e) => setTx((t) => ({ ...t, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
                <Field label={t("common.note")}>
                  <input
                    value={tx.note}
                    onChange={(e) => setTx((t) => ({ ...t, note: e.target.value }))}
                    placeholder="Diesel 200L / NEFT"
                  />
                </Field>
                <div>
                  <button
                    className="primary"
                    type="submit"
                    disabled={busy || !num(tx.amount)}
                  >
                    {busy ? t("credit.posting") : t("credit.postToAccount")}
                  </button>
                </div>
              </form>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
