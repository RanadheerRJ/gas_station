import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { CashIcon, GaugeIcon, NozzleIcon, PumpIcon, ShiftIcon, StatusDot } from "../components/icons";
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
  PAYMENT_LABELS,
  PAYMENT_MODES,
  litresBetween,
  nozzleOccupancy,
  paymentsTotal,
  pumpOccupancy,
  shiftTotals,
  validateClosing,
  varianceLabel,
  varianceTone,
} from "../lib/shiftMath";

export const fuelClass = (fuelType = "") => {
  const f = fuelType.toLowerCase();
  if (f.includes("premium")) return "premium";
  if (f.includes("petrol")) return "petrol";
  if (f.includes("diesel")) return "diesel";
  if (f.includes("cng")) return "cng";
  return "premium";
};

export default function Shifts() {
  const { profile } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();

  const [stationId, setStationId] = useState("");
  const [shifts, setShifts] = useState([]);
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [picked, setPicked] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [closingFor, setClosingFor] = useState(null);

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
      setPumps(eq.pumps);
      setNozzles(eq.nozzles);
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

  const openShifts = shifts.filter((s) => s.status === "open");
  const closed = shifts.filter((s) => s.status === "closed");
  const station = stations.find((s) => s.id === stationId);

  const occupancy = useMemo(() => pumpOccupancy(pumps, nozzles, openShifts), [
    pumps,
    nozzles,
    openShifts,
  ]);
  const nozzleBusy = useMemo(() => nozzleOccupancy(openShifts), [openShifts]);

  const busyCount = Object.values(occupancy).filter((o) => o.busy).length;
  const freeCount = pumps.length - busyCount;

  // Your own open shift, if you have one.
  const myShift = openShifts.find((s) => s.userId === profile.uid);

  const today = closed.filter((s) => s.date === new Date().toISOString().slice(0, 10));
  const todaySummary = useMemo(() => {
    const t = today.map(shiftTotals);
    return {
      litres: t.reduce((n, x) => n + x.totalLitres, 0),
      gross: t.reduce((n, x) => n + x.gross, 0),
      declared: t.reduce((n, x) => n + (x.declared ?? 0), 0),
      variance: t.reduce((n, x) => n + (x.variance ?? 0), 0),
    };
  }, [today]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await openShift(stationId, { employeeName: profile.name, nozzleIds: picked }, profile);
      setPicked([]);
      setStarting(false);
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

  const activeNozzles = nozzles.filter((n) => !nozzleBusy[n.id]);

  return (
    <>
      <PageHeader
        title="Shifts"
        sub={
          station
            ? `${station.name} · ${freeCount} pump${freeCount === 1 ? "" : "s"} free · ${busyCount} busy`
            : ""
        }
        actions={
          !myShift &&
          !starting &&
          activeNozzles.length > 0 && (
            <button className="primary" type="button" onClick={() => setStarting(true)}>
              Start shift
            </button>
          )
        }
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

        {/* -------- live forecourt -------- */}
        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <PumpIcon /> Forecourt right now
            </span>
          }
          note="A pump is busy while any of its nozzles is in an open shift."
        >
          {pumps.length === 0 ? (
            <Empty>
              No pumps configured. An owner needs to add pumps and nozzles first.
            </Empty>
          ) : (
            <>
              <div className="pump-board">
                {pumps.map((p) => {
                  const occ = occupancy[p.id] || {};
                  const mine = nozzles.filter((n) => n.pumpId === p.id);
                  const fuels = [...new Set(mine.map((n) => n.fuelType))];
                  return (
                    <div key={p.id} className={`pump-tile${occ.busy ? " busy" : ""}`}>
                      <div className="pump-tile__head">
                        <div>
                          <div className="pump-tile__name">
                            <PumpIcon size={16} />
                            {p.name}
                          </div>
                          <div className="pump-tile__meta">
                            {mine.length} nozzle{mine.length === 1 ? "" : "s"}
                            {fuels.length ? ` · ${fuels.join(" · ")}` : ""}
                          </div>
                        </div>
                        <span className="pump-tile__state">
                          <StatusDot
                            tone={occ.busy ? "rust" : "green"}
                            title={occ.busy ? "busy" : "available"}
                          />
                          {occ.busy ? "Busy" : "Free"}
                        </span>
                      </div>

                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        {mine.map((n) => (
                          <span
                            key={n.id}
                            className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`}
                            title={`${n.name} · ${n.fuelType}${
                              nozzleBusy[n.id] ? ` · ${nozzleBusy[n.id].operator}` : ""
                            }`}
                          />
                        ))}
                        <span className="small muted">
                          {occ.busy
                            ? `${occ.operators.join(", ")} fuelling`
                            : "Available to take"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="divider" />
              <div className="fuel-key">
                <span className="k">
                  <span className="fuel-dot fuel-dot--petrol" /> Petrol
                </span>
                <span className="k">
                  <span className="fuel-dot fuel-dot--diesel" /> Diesel
                </span>
                <span className="k">
                  <span className="fuel-dot fuel-dot--premium" /> Premium
                </span>
                <span className="k">
                  <span className="fuel-dot fuel-dot--cng" /> CNG
                </span>
              </div>
            </>
          )}
        </Panel>

        {/* -------- start a shift: pick your nozzles -------- */}
        {starting && !myShift && (
          <Panel
            title={
              <span className="row" style={{ gap: 7, alignItems: "center" }}>
                <ShiftIcon /> Start your shift
              </span>
            }
            note="Tick the nozzles you are taking. Opening readings come from each meter — you never type them."
            flush
          >
            <div>
              {nozzles.map((n) => {
                const held = nozzleBusy[n.id];
                const pump = pumps.find((p) => p.id === n.pumpId);
                const checked = picked.includes(n.id);
                return (
                  <label
                    key={n.id}
                    className={`nozzle-pick${held ? " disabled" : ""}`}
                    style={{ cursor: held ? "not-allowed" : "pointer" }}
                  >
                    <input
                      type="checkbox"
                      disabled={!!held}
                      checked={checked}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked
                            ? [...prev, n.id]
                            : prev.filter((x) => x !== n.id)
                        )
                      }
                    />
                    <div className="nozzle-pick__body">
                      <div className="nozzle-pick__title">
                        <span className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`} />
                        {pump?.name || "Pump"} · {n.name}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {n.fuelType}
                        </span>
                      </div>
                      <div className="nozzle-pick__sub">
                        {held ? (
                          <>In an active shift by {held.operator}</>
                        ) : (
                          <>
                            Opening reading{" "}
                            <span className="mono">{money(n.lastReading)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="body row" style={{ borderTop: "1px solid var(--hairline)" }}>
              <button
                className="primary"
                type="button"
                disabled={busy || picked.length === 0}
                onClick={start}
              >
                {busy
                  ? "Starting…"
                  : `Start shift on ${picked.length} nozzle${picked.length === 1 ? "" : "s"}`}
              </button>
              <button type="button" onClick={() => { setStarting(false); setPicked([]); }}>
                Cancel
              </button>
            </div>
          </Panel>
        )}

        {/* -------- open shifts -------- */}
        {openShifts.map((s) =>
          closingFor === s.id ? (
            <CloseShiftPanel
              key={s.id}
              shift={s}
              customers={customers}
              busy={busy}
              onCancel={() => setClosingFor(null)}
              onSubmit={async (payload) => {
                setBusy(true);
                setError("");
                try {
                  await closeShift(stationId, s.id, payload, profile);
                  setClosingFor(null);
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
              key={s.id}
              title={
                <span className="row" style={{ gap: 7, alignItems: "center" }}>
                  <StatusDot tone="amber" title="open" />
                  {s.employeeName} — shift open
                </span>
              }
              note={`Started ${formatStamp(s.startTime)} · ${s.nozzles.length} nozzle${
                s.nozzles.length === 1 ? "" : "s"
              }`}
              actions={
                (s.userId === profile.uid || profile.role !== "attendant") && (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => setClosingFor(s.id)}
                  >
                    Close shift
                  </button>
                )
              }
              flush
            >
              <table>
                <thead>
                  <tr>
                    <th>Nozzle</th>
                    <th>Fuel</th>
                    <th className="num">Opening</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {s.nozzles.map((n) => (
                    <tr key={n.nozzleId}>
                      <td>
                        <span className="row" style={{ gap: 6, alignItems: "center" }}>
                          <span className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`} />
                          {n.label}
                        </span>
                      </td>
                      <td>{n.fuelType}</td>
                      <td className="num mono">{money(n.openingReading)}</td>
                      <td className="num mono">{money(n.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )
        )}

        {today.length > 0 && (
          <Panel title="Today, so far">
            <div className="row" style={{ gap: 40 }}>
              <Stat label="Litres sold" value={money(todaySummary.litres)} />
              <Stat label="Fuel sales" value={`₹ ${money(todaySummary.gross)}`} />
              <Stat label="Collected" value={`₹ ${money(todaySummary.declared)}`} />
              <Stat
                label="Variance"
                value={`₹ ${money(todaySummary.variance)}`}
                tone={varianceTone(todaySummary.variance)}
              />
            </div>
          </Panel>
        )}

        {/* -------- closed shifts -------- */}
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
                  <th>Operator</th>
                  <th className="num">Litres</th>
                  <th className="num">Gross</th>
                  <th className="num">Net</th>
                  <th className="num">Collected</th>
                  <th className="num">Variance</th>
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
                            {s.employeeName}
                          </span>
                        </td>
                        <td className="num mono">{money(t.totalLitres)}</td>
                        <td className="num mono">{money(t.gross)}</td>
                        <td className="num mono">{money(t.net)}</td>
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
                          <td colSpan={8} style={{ background: "#fbfaf6" }}>
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
/* closing: enter closing readings + split the payments                */
/* ------------------------------------------------------------------ */

function CloseShiftPanel({ shift, customers, onSubmit, onCancel, busy }) {
  const [closings, setClosings] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [creditSales, setCreditSales] = useState([]);
  const [payments, setPayments] = useState({
    cash: "",
    card: "",
    upi: "",
    credit: "",
    other: "",
  });
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState([]);

  const withClosings = useMemo(
    () =>
      shift.nozzles.map((n) => ({ ...n, closingReading: closings[n.nozzleId] ?? "" })),
    [shift.nozzles, closings]
  );

  const preview = useMemo(
    () => shiftTotals({ nozzles: withClosings, expenses, creditSales, payments }),
    [withClosings, expenses, creditSales, payments]
  );

  // Credit taken this shift is a payment mode too — keep the two in step so
  // the operator isn't asked for the same figure twice.
  const creditTotal = creditSales.reduce((n, c) => n + num(c.amount), 0);
  useEffect(() => {
    setPayments((p) => ({ ...p, credit: creditTotal ? String(creditTotal) : "" }));
  }, [creditTotal]);

  const submit = () => {
    const found = validateClosing(withClosings);
    if (found.length) {
      setProblems(found);
      return;
    }
    setProblems([]);
    onSubmit({
      closingReadings: Object.fromEntries(
        withClosings.map((n) => [n.nozzleId, n.closingReading])
      ),
      expenses,
      creditSales,
      payments,
      note,
    });
  };

  return (
    <Panel
      title={
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <GaugeIcon /> Close {shift.employeeName}'s shift
        </span>
      }
      note={`Started ${formatStamp(shift.startTime)}`}
    >
      <div className="stack">
        <div>
          <h3 style={{ marginBottom: 8 }}>Closing readings</h3>
          <div className="panel flush">
            <table>
              <thead>
                <tr>
                  <th>Nozzle</th>
                  <th className="num">Opening</th>
                  <th className="num">Closing</th>
                  <th className="num">Litres</th>
                  <th className="num">Price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shift.nozzles.map((n) => {
                  const typed = closings[n.nozzleId] ?? "";
                  const litres =
                    typed === "" ? null : litresBetween(n.openingReading, typed);
                  const below = typed !== "" && num(typed) < num(n.openingReading);
                  return (
                    <tr key={n.nozzleId}>
                      <td>
                        <span className="row" style={{ gap: 6, alignItems: "center" }}>
                          <span className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`} />
                          {n.label}
                        </span>
                      </td>
                      <td className="num mono muted">{money(n.openingReading)}</td>
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
                            setClosings((c) => ({ ...c, [n.nozzleId]: e.target.value }))
                          }
                          placeholder={money(n.openingReading)}
                        />
                      </td>
                      <td className="num mono">{litres == null ? "—" : money(litres)}</td>
                      <td className="num mono muted">{money(n.price)}</td>
                      <td className="num mono">
                        {litres == null ? "—" : money(litres * num(n.price))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num mono">{money(preview.totalLitres)}</td>
                  <td />
                  <td className="num mono">{money(preview.gross)}</td>
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
            <CashIcon size={16} /> What you collected
          </h3>
          <div className="form-grid">
            {PAYMENT_MODES.map((mode) => (
              <Field
                key={mode}
                label={PAYMENT_LABELS[mode]}
                hint={mode === "credit" ? "from the list above" : undefined}
              >
                <input
                  className="mono"
                  inputMode="decimal"
                  style={{ textAlign: "right" }}
                  value={payments[mode]}
                  readOnly={mode === "credit"}
                  onChange={(e) =>
                    setPayments((p) => ({ ...p, [mode]: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </Field>
            ))}
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
            <Stat label="Gross sales" value={money(preview.gross)} />
            <Stat label="Less expenses" value={money(preview.expensesTotal)} />
            <Stat label="Net due" value={money(preview.net)} />
            <Stat label="Collected" value={money(paymentsTotal(payments))} />
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
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
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
              <th className="num">Price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((l) => (
              <tr key={l.nozzleId}>
                <td>
                  <span className="row" style={{ gap: 6, alignItems: "center" }}>
                    <span className={`fuel-dot fuel-dot--${fuelClass(l.fuelType)}`} />
                    {l.label}
                  </span>
                </td>
                <td className="num mono">{money(l.openingReading)}</td>
                <td className="num mono">{money(l.closingReading)}</td>
                <td className="num mono">{money(l.litresSold)}</td>
                <td className="num mono">{money(l.price)}</td>
                <td className="num mono">{money(l.revenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td className="num mono">{money(totals.totalLitres)}</td>
              <td />
              <td className="num mono">{money(totals.gross)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 240 }}>
        <h3 style={{ marginBottom: 6 }}>Settlement</h3>
        <table>
          <tbody>
            <tr>
              <td>Gross sales</td>
              <td className="num mono">{money(totals.gross)}</td>
            </tr>
            <tr>
              <td>Expenses</td>
              <td className="num mono">−{money(totals.expensesTotal)}</td>
            </tr>
            <tr className="total">
              <td>Net due</td>
              <td className="num mono">{money(totals.net)}</td>
            </tr>
            {PAYMENT_MODES.map((mode) => (
              <tr key={mode}>
                <td className="muted">{PAYMENT_LABELS[mode]}</td>
                <td className="num mono">{money(totals.payments[mode])}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Collected</td>
              <td className="num mono">{money(totals.declared)}</td>
            </tr>
            <tr className="total">
              <td>Variance · {varianceLabel(totals.variance)}</td>
              <td
                className="num mono"
                style={{
                  color:
                    varianceTone(totals.variance) === "neg"
                      ? "var(--rust)"
                      : "var(--green)",
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
