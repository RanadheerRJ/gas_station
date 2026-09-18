import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { CashIcon, GaugeIcon, NozzleIcon, ShiftIcon, StatusDot } from "../components/icons";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  closeShift,
  listCustomers,
  listPumps,
  listShifts,
  openShift,
  readableError,
} from "../lib/api";
import { formatDate, formatStamp, money, num } from "../lib/format";
import {
  litresBetween,
  shiftTotals,
  validateClosing,
  varianceLabel,
  varianceTone,
} from "../lib/shiftMath";

export default function Shifts() {
  const { profile, canAmend } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();

  const [stationId, setStationId] = useState("");
  const [shifts, setShifts] = useState([]);
  const [nozzleCount, setNozzleCount] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shiftName, setShiftName] = useState("Morning");
  const [expanded, setExpanded] = useState(null);

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
      const [sh, eq, cust] = await Promise.all([
        listShifts(stationId),
        listPumps(stationId),
        listCustomers(stationId),
      ]);
      setShifts(sh);
      setNozzleCount(eq.nozzles.length);
      setCustomers(cust);
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

  const openOne = shifts.find((s) => s.status === "open");
  const closed = shifts.filter((s) => s.status === "closed");
  const station = stations.find((s) => s.id === stationId);

  const today = closed.filter((s) => s.date === new Date().toISOString().slice(0, 10));
  const todaySummary = useMemo(() => {
    const t = today.map(shiftTotals);
    return {
      litres: t.reduce((n, x) => n + x.totalLitres, 0),
      sales: t.reduce((n, x) => n + x.grossSales, 0),
      cash: t.reduce((n, x) => n + (x.declared ?? 0), 0),
      variance: t.reduce((n, x) => n + (x.variance ?? 0), 0),
    };
  }, [today]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await openShift(stationId, { name: shiftName.trim() || "Shift" }, profile);
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Shifts" />
        <div className="content">
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Shifts"
        sub={station ? `${station.name} · readings-based` : ""}
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title="Station">
            <StationPicker
              stations={stations}
              value={stationId}
              onChange={(id) => setParams({ station: id })}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {today.length > 0 && (
          <Panel title="Today, so far">
            <div className="row" style={{ gap: 40 }}>
              <Stat label="Litres sold" value={money(todaySummary.litres)} />
              <Stat label="Fuel sales" value={`₹ ${money(todaySummary.sales)}`} />
              <Stat label="Cash declared" value={`₹ ${money(todaySummary.cash)}`} />
              <Stat
                label="Variance"
                value={`₹ ${money(todaySummary.variance)}`}
                tone={varianceTone(todaySummary.variance)}
              />
            </div>
          </Panel>
        )}

        {openOne ? (
          <OpenShiftPanel
            shift={openOne}
            customers={customers}
            busy={busy}
            onClose={async (payload) => {
              setBusy(true);
              setError("");
              try {
                await closeShift(stationId, openOne.id, payload, profile);
                await load();
              } catch (err) {
                setError(readableError(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
          <Panel
            title={
              <span className="row" style={{ gap: 7, alignItems: "center" }}>
                <ShiftIcon /> No shift open
              </span>
            }
          >
            {nozzleCount === 0 ? (
              <Notice kind="error">
                This station has no nozzles yet. An owner needs to add pumps, nozzles and
                today's rates before a shift can be opened.
              </Notice>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                <div className="small muted">
                  Opening a shift snapshots every nozzle's current meter reading and the
                  rates in force. At handover you enter only the closing readings.
                </div>
                <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                  <Field label="Shift name">
                    <input
                      value={shiftName}
                      onChange={(e) => setShiftName(e.target.value)}
                      placeholder="Morning"
                      style={{ width: 180 }}
                    />
                  </Field>
                  <button className="primary" type="button" disabled={busy} onClick={start}>
                    {busy ? "Opening…" : "Open shift"}
                  </button>
                </div>
              </div>
            )}
          </Panel>
        )}

        <Panel title="Closed shifts" flush>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : closed.length === 0 ? (
            <Empty>No shifts closed yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th className="num">Litres</th>
                  <th className="num">Sales</th>
                  <th className="num">Expected</th>
                  <th className="num">Declared</th>
                  <th className="num">Variance</th>
                  <th>Closed by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {closed.map((s) => {
                  const t = shiftTotals(s);
                  const open = expanded === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td className="mono small">{formatDate(s.date)}</td>
                        <td>
                          <span className="row" style={{ gap: 6, alignItems: "center" }}>
                            <StatusDot
                              tone={varianceTone(t.variance) === "neg" ? "rust" : "green"}
                              title={varianceLabel(t.variance)}
                            />
                            {s.name}
                          </span>
                        </td>
                        <td className="num mono">{money(t.totalLitres)}</td>
                        <td className="num mono">{money(t.grossSales)}</td>
                        <td className="num mono">{money(t.expectedCash)}</td>
                        <td className="num mono">{money(t.declared)}</td>
                        <td
                          className="num mono"
                          style={{
                            color:
                              varianceTone(t.variance) === "neg"
                                ? "var(--rust)"
                                : "var(--green)",
                          }}
                        >
                          {money(t.variance)}
                        </td>
                        <td className="small">
                          {s.closedByName || "—"}
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {formatStamp(s.closedAt)}
                          </div>
                        </td>
                        <td className="num">
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setExpanded(open ? null : s.id)}
                          >
                            {open ? "hide" : "detail"}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={9} style={{ background: "#fbfaf6" }}>
                            <ClosedShiftDetail shift={s} totals={t} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* the open shift: enter closing readings only                         */
/* ------------------------------------------------------------------ */

function OpenShiftPanel({ shift, customers, onClose, busy }) {
  const [closings, setClosings] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [creditSales, setCreditSales] = useState([]);
  const [digital, setDigital] = useState("");
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState([]);

  // Live preview of the shift as it would close with what's typed so far.
  const preview = useMemo(() => {
    const readings = {};
    Object.entries(shift.readings || {}).forEach(([id, r]) => {
      readings[id] = { ...r, closing: closings[id] ?? "" };
    });
    return shiftTotals({
      readings,
      expenses,
      creditSales,
      digitalCollected: digital,
      cashDeclared: cash,
    });
  }, [shift.readings, closings, expenses, creditSales, digital, cash]);

  const submit = () => {
    const readings = {};
    Object.entries(shift.readings || {}).forEach(([id, r]) => {
      readings[id] = { ...r, closing: closings[id] ?? "" };
    });
    const found = validateClosing(readings);
    if (found.length) {
      setProblems(found);
      return;
    }
    setProblems([]);
    onClose({
      readings,
      expenses,
      creditSales,
      digitalCollected: num(digital),
      cashDeclared: num(cash),
      note,
    });
  };

  return (
    <Panel
      title={
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <StatusDot tone="amber" title="open" />
          {shift.name} shift — open
        </span>
      }
      note={`Opened ${formatStamp(shift.openedAt)} by ${shift.openedByName || "—"}`}
    >
      <div className="stack">
        <div>
          <h3 className="row" style={{ gap: 7, alignItems: "center", marginBottom: 8 }}>
            <GaugeIcon size={16} /> Closing readings
          </h3>
          <div className="panel flush">
            <table>
              <thead>
                <tr>
                  <th>Nozzle</th>
                  <th>Fuel</th>
                  <th className="num">Opening</th>
                  <th className="num">Closing</th>
                  <th className="num">Litres</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(shift.readings || {}).map(([id, r]) => {
                  const typed = closings[id] ?? "";
                  const litres = typed === "" ? null : litresBetween(r.opening, typed);
                  const below = typed !== "" && num(typed) < num(r.opening);
                  return (
                    <tr key={id}>
                      <td>
                        <span className="row" style={{ gap: 6, alignItems: "center" }}>
                          <NozzleIcon size={15} />
                          {r.label}
                        </span>
                      </td>
                      <td>{r.fuelType}</td>
                      <td className="num mono muted">{money(r.opening)}</td>
                      <td className="num">
                        <input
                          className="mono"
                          inputMode="decimal"
                          style={{
                            textAlign: "right",
                            width: 130,
                            borderColor: below ? "var(--rust)" : undefined,
                          }}
                          value={typed}
                          onChange={(e) =>
                            setClosings((c) => ({ ...c, [id]: e.target.value }))
                          }
                          placeholder={money(r.opening)}
                        />
                      </td>
                      <td className="num mono">{litres == null ? "—" : money(litres)}</td>
                      <td className="num mono muted">{money(r.rate)}</td>
                      <td className="num mono">
                        {litres == null ? "—" : money(litres * num(r.rate))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total</td>
                  <td className="num mono">{money(preview.totalLitres)}</td>
                  <td />
                  <td className="num mono">{money(preview.grossSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <LineEditor
          title="Expenses paid from the drawer"
          rows={expenses}
          setRows={setExpenses}
          labelPlaceholder="Power bill"
          addLabel="Add expense"
        />

        <CreditEditor rows={creditSales} setRows={setCreditSales} customers={customers} />

        <div>
          <h3 className="row" style={{ gap: 7, alignItems: "center", marginBottom: 8 }}>
            <CashIcon size={16} /> Handover
          </h3>
          <div className="form-grid">
            <Field label="Card / UPI collected" hint="not in the drawer">
              <input
                className="mono"
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={digital}
                onChange={(e) => setDigital(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Cash counted" hint="what you are handing over">
              <input
                className="mono"
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Note" hint="optional">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Meter 2 sticking"
              />
            </Field>
          </div>
        </div>

        <div className="panel">
          <div className="body row" style={{ gap: 36, flexWrap: "wrap" }}>
            <Stat label="Fuel sales" value={money(preview.grossSales)} />
            <Stat label="Less credit" value={money(preview.creditTotal)} />
            <Stat label="Less card / UPI" value={money(preview.digital)} />
            <Stat label="Less expenses" value={money(preview.expensesTotal)} />
            <Stat label="Expected cash" value={money(preview.expectedCash)} />
            <Stat
              label={`Variance · ${varianceLabel(preview.variance)}`}
              value={preview.variance == null ? "—" : money(preview.variance)}
              tone={varianceTone(preview.variance)}
            />
          </div>
        </div>

        {problems.length > 0 && (
          <Notice kind="error">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Notice>
        )}

        <div className="row">
          <button className="primary" type="button" disabled={busy} onClick={submit}>
            {busy ? "Closing…" : "Close shift & hand over"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function LineEditor({ title, rows, setRows, labelPlaceholder, addLabel }) {
  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3>{title}</h3>
        <button
          type="button"
          className="small"
          onClick={() => setRows((r) => [...r, { label: "", amount: "" }])}
        >
          {addLabel}
        </button>
      </div>
      <div className="panel flush">
        <table>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="muted small">None recorded.</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={row.label}
                    placeholder={labelPlaceholder}
                    onChange={(e) =>
                      setRows((r) => {
                        const next = [...r];
                        next[i] = { ...next[i], label: e.target.value };
                        return next;
                      })
                    }
                  />
                </td>
                <td className="num" style={{ width: 170 }}>
                  <input
                    className="mono"
                    inputMode="decimal"
                    style={{ textAlign: "right" }}
                    value={row.amount}
                    placeholder="0.00"
                    onChange={(e) =>
                      setRows((r) => {
                        const next = [...r];
                        next[i] = { ...next[i], amount: e.target.value };
                        return next;
                      })
                    }
                  />
                </td>
                <td style={{ width: 40 }}>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditEditor({ rows, setRows, customers }) {
  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3>Credit sales this shift</h3>
        <button
          type="button"
          className="small"
          onClick={() => setRows((r) => [...r, { customerId: "", name: "", amount: "" }])}
        >
          Add credit sale
        </button>
      </div>
      <div className="panel flush">
        <table>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="muted small">None recorded.</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <select
                    value={row.customerId || ""}
                    onChange={(e) => {
                      const c = customers.find((x) => x.id === e.target.value);
                      setRows((r) => {
                        const next = [...r];
                        next[i] = {
                          ...next[i],
                          customerId: e.target.value,
                          name: c?.name || "",
                        };
                        return next;
                      });
                    }}
                  >
                    <option value="">Select customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num" style={{ width: 170 }}>
                  <input
                    className="mono"
                    inputMode="decimal"
                    style={{ textAlign: "right" }}
                    value={row.amount}
                    placeholder="0.00"
                    onChange={(e) =>
                      setRows((r) => {
                        const next = [...r];
                        next[i] = { ...next[i], amount: e.target.value };
                        return next;
                      })
                    }
                  />
                </td>
                <td style={{ width: 40 }}>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.customerId) && (
        <div className="small muted" style={{ marginTop: 6 }}>
          These post to the customers' accounts when the shift closes.
        </div>
      )}
    </div>
  );
}

function ClosedShiftDetail({ shift, totals }) {
  return (
    <div className="row" style={{ gap: 28, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 420px", minWidth: 340 }}>
        <h3 style={{ marginBottom: 6 }}>Meter readings</h3>
        <table>
          <thead>
            <tr>
              <th>Nozzle</th>
              <th className="num">Opening</th>
              <th className="num">Closing</th>
              <th className="num">Litres</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((l) => (
              <tr key={l.nozzleId}>
                <td>{l.label}</td>
                <td className="num mono">{money(l.opening)}</td>
                <td className="num mono">{money(l.closing)}</td>
                <td className="num mono">{money(l.litres)}</td>
                <td className="num mono">{money(l.rate)}</td>
                <td className="num mono">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td className="num mono">{money(totals.totalLitres)}</td>
              <td />
              <td className="num mono">{money(totals.grossSales)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 240 }}>
        <h3 style={{ marginBottom: 6 }}>Settlement</h3>
        <table>
          <tbody>
            <tr>
              <td>Fuel sales</td>
              <td className="num mono">{money(totals.grossSales)}</td>
            </tr>
            <tr>
              <td>Credit</td>
              <td className="num mono">−{money(totals.creditTotal)}</td>
            </tr>
            <tr>
              <td>Card / UPI</td>
              <td className="num mono">−{money(totals.digital)}</td>
            </tr>
            <tr>
              <td>Expenses</td>
              <td className="num mono">−{money(totals.expensesTotal)}</td>
            </tr>
            <tr className="total">
              <td>Expected cash</td>
              <td className="num mono">{money(totals.expectedCash)}</td>
            </tr>
            <tr>
              <td>Declared</td>
              <td className="num mono">{money(totals.declared)}</td>
            </tr>
            <tr className="total">
              <td>Variance · {varianceLabel(totals.variance)}</td>
              <td
                className="num mono"
                style={{
                  color:
                    varianceTone(totals.variance) === "neg" ? "var(--rust)" : "var(--green)",
                }}
              >
                {money(totals.variance)}
              </td>
            </tr>
          </tbody>
        </table>

        {(shift.expenses || []).length > 0 && (
          <>
            <h3 style={{ margin: "12px 0 6px" }}>Expenses</h3>
            <table>
              <tbody>
                {shift.expenses.map((e, i) => (
                  <tr key={i}>
                    <td>{e.label || "—"}</td>
                    <td className="num mono">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {shift.note && (
          <>
            <div className="divider" />
            <div className="small">
              <span className="muted">Note: </span>
              {shift.note}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
