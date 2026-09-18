import { useCallback, useEffect, useState } from "react";
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

export default function CreditCustomers() {
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
        title="Credit customers"
        sub={station?.name}
        actions={
          <button type="button" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "Add customer"}
          </button>
        }
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title="Station">
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

        <Panel title="Outstanding position">
          <div className="row" style={{ gap: 40 }}>
            <Stat
              label="Total outstanding"
              amount={totalOutstanding}
              format={money}
              prefix="₹ "
              tone={totalOutstanding > 0 ? "neg" : "pos"}
            />
            <Stat
              label="Customers"
              amount={customers.length}
              format={(n) => String(Math.round(n))}
            />
            <Stat
              label="Fully settled"
              amount={settled}
              format={(n) => String(Math.round(n))}
              tone="pos"
            />
          </div>
        </Panel>

        {showAdd && (
          <Panel title="New credit customer">
            <form className="stack" onSubmit={addCustomer}>
              <div className="form-grid">
                <Field label="Customer name">
                  <input
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((c) => ({ ...c, name: e.target.value }))
                    }
                    placeholder="Sri Balaji Transports"
                  />
                </Field>
                <Field label="Phone">
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
                  {busy ? "Saving…" : "Add customer"}
                </button>
              </div>
            </form>
          </Panel>
        )}

        <Panel title="Customer balances" flush>
          {loading ? (
            <LoadingPanels count={2} lines={3} label="Loading customers" />
          ) : customers.length === 0 ? (
            <Empty>No credit customers at this station.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th className="num">Credit given</th>
                  <th className="num">Payments</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
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
                          <span className="tag rust">outstanding</span>
                        ) : (
                          <span className="tag green">settled</span>
                        )}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => setSelected(selected?.id === c.id ? null : c)}
                        >
                          {selected?.id === c.id ? "close" : "open"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total outstanding</td>
                  <td className="num mono">{money(totalOutstanding)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>

        {selected && (
          <Panel
            title={`${selected.name} · account`}
            note={`Balance ₹ ${money(selected.outstandingBalance)}`}
          >
            <div className="row" style={{ gap: 24, alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                <div className="panel flush">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Note</th>
                        <th className="num">Amount</th>
                        <th className="num">Running</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.transactions || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="muted small">
                            No transactions yet.
                          </td>
                        </tr>
                      )}
                      {(() => {
                        let running = 0;
                        return (selected.transactions || []).map((t, i) => {
                          running += t.type === "credit" ? num(t.amount) : -num(t.amount);
                          return (
                            <tr key={i}>
                              <td className="mono small">{formatDate(t.date)}</td>
                              <td>
                                <span
                                  className={`tag ${t.type === "credit" ? "rust" : "green"}`}
                                >
                                  {t.type}
                                </span>
                              </td>
                              <td className="small">{t.note || "—"}</td>
                              <td className="num mono">{money(t.amount)}</td>
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
                <h3>Record transaction</h3>
                <Field label="Type">
                  <select
                    value={tx.type}
                    onChange={(e) => setTx((t) => ({ ...t, type: e.target.value }))}
                  >
                    <option value="credit">Credit given</option>
                    <option value="payment">Payment received</option>
                  </select>
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    className="mono"
                    value={tx.date}
                    max={todayISO()}
                    onChange={(e) => setTx((t) => ({ ...t, date: e.target.value }))}
                  />
                </Field>
                <Field label="Amount">
                  <input
                    className="mono"
                    inputMode="decimal"
                    value={tx.amount}
                    onChange={(e) => setTx((t) => ({ ...t, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Note">
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
                    {busy ? "Posting…" : "Post to account"}
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
