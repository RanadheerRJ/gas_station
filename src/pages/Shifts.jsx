import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { CashIcon, GaugeIcon, NozzleIcon, PumpIcon, ShiftIcon, StatusDot } from "../components/icons";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  addNozzleToShift,
  approveShift,
  closeShift,
  listCustomers,
  listPumps,
  listShifts,
  openShift,
  readableError,
  rejectShift,
  removeNozzleFromShift,
  reviseShift,
} from "../lib/api";
import { formatDate, formatStamp, money, num } from "../lib/format";
import {
  PAYMENT_LABELS,
  PAYMENT_MODES,
  SHIFT_STATUS,
  VARIANCE_TOLERANCE,
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
  const [addTo, setAddTo] = useState("");
  const [addNozzleId, setAddNozzleId] = useState("");

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

  const openShifts = shifts.filter((s) => s.status === SHIFT_STATUS.OPEN);
  // Everything that has been handed in: awaiting review, sent back, or signed off.
  const settled = shifts.filter((s) => s.status !== SHIFT_STATUS.OPEN);
  const awaiting = settled.filter((s) => s.status !== SHIFT_STATUS.APPROVED);
  const station = stations.find((s) => s.id === stationId);
  const canReview = profile.role === "owner" || profile.role === "manager";

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

  const today = settled.filter((s) => s.date === new Date().toISOString().slice(0, 10));
  const todaySummary = useMemo(() => {
    const t = today.map(shiftTotals);
    return {
      litres: t.reduce((n, x) => n + x.totalLitres, 0),
      gross: t.reduce((n, x) => n + x.gross, 0),
      declared: t.reduce((n, x) => n + (x.declared ?? 0), 0),
      variance: t.reduce((n, x) => n + (x.variance ?? 0), 0),
    };
  }, [today]);

  /** Wrap a mutation with the shared busy/error/reload plumbing. */
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(readableError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const attachNozzle = (shiftId) =>
    run(async () => {
      await addNozzleToShift(stationId, shiftId, addNozzleId, profile);
      setAddTo("");
      setAddNozzleId("");
    });

  const dropNozzle = (shiftId, nozzleId) =>
    run(() => removeNozzleFromShift(stationId, shiftId, nozzleId));

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
  const freeNozzles = activeNozzles;

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
                    <th />
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
                      <td className="num" style={{ width: 80 }}>
                        {s.nozzles.length > 1 && (
                          <button
                            type="button"
                            className="quiet"
                            disabled={busy}
                            onClick={() => dropNozzle(s.id, n.nozzleId)}
                          >
                            drop
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Operators often pick up another pump partway through. */}
              <div
                className="body row"
                style={{
                  borderTop: "1px solid var(--hairline)",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span className="small muted">Took another nozzle?</span>
                <select
                  value={addTo === s.id ? addNozzleId : ""}
                  disabled={busy || freeNozzles.length === 0}
                  onChange={(e) => {
                    setAddTo(s.id);
                    setAddNozzleId(e.target.value);
                  }}
                >
                  <option value="">
                    {freeNozzles.length === 0 ? "No free nozzles" : "Add a nozzle…"}
                  </option>
                  {freeNozzles.map((n) => (
                    <option key={n.id} value={n.id}>
                      {pumps.find((p) => p.id === n.pumpId)?.name || "Pump"} · {n.name} (
                      {n.fuelType})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || addTo !== s.id || !addNozzleId}
                  onClick={() => attachNozzle(s.id)}
                >
                  Add to shift
                </button>
                <span className="small muted">
                  Its opening reading is taken from the meter now.
                </span>
              </div>
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
        <Panel
          title="Closed shifts"
          note={
            awaiting.length
              ? `${awaiting.length} awaiting the owner's sign-off`
              : "All shifts signed off."
          }
          flush
        >
          {loading ? (
            <Empty>Loading…</Empty>
          ) : settled.length === 0 ? (
            <Empty>No shifts closed yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Operator</th>
                  <th>Status</th>
                  <th className="num">Litres</th>
                  <th className="num">Gross</th>
                  <th className="num">Testing</th>
                  <th className="num">Net</th>
                  <th className="num">Handover</th>
                  <th className="num">Variance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {settled.map((s) => {
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
                        <td>
                          <StatusTag status={s.status} />
                        </td>
                        <td className="num mono">{money(t.totalLitres)}</td>
                        <td className="num mono">{money(t.gross)}</td>
                        <td className="num mono">{money(t.testingTotal)}</td>
                        <td className="num mono">{money(t.net)}</td>
                        <td className="num mono">{money(t.handover)}</td>
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
                          <td colSpan={10} style={{ background: "#fbfaf6" }}>
                            <ClosedShiftDetail
                              shift={s}
                              totals={t}
                              customers={customers}
                              canReview={canReview}
                              busy={busy}
                              onRevise={(patch) =>
                                run(() => reviseShift(stationId, s.id, patch, profile))
                              }
                              onApprove={() =>
                                run(() => approveShift(stationId, s.id, profile))
                              }
                              onReject={(reason) =>
                                run(() => rejectShift(stationId, s.id, reason, profile))
                              }
                            />
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
  const [testing, setTesting] = useState({ MS: "", HSD: "" });
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState([]);

  const withClosings = useMemo(
    () =>
      shift.nozzles.map((n) => ({ ...n, closingReading: closings[n.nozzleId] ?? "" })),
    [shift.nozzles, closings]
  );

  const preview = useMemo(
    () => shiftTotals({ nozzles: withClosings, expenses, creditSales, payments, testing }),
    [withClosings, expenses, creditSales, payments, testing]
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
      testing,
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
      note={`Started ${formatStamp(shift.startTime)} · goes to the owner for review once submitted`}
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

        <TestingEditor testing={testing} setTesting={setTesting} />

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

        <HandoverSummary totals={preview} />

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
            {busy ? "Submitting…" : "Close shift & send for review"}
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

/**
 * Daily fuel testing. Every pump is test-dispensed each day and the fuel goes
 * back into the tank, so the money was never collected — it comes off gross
 * before anything is owed to the owner.
 */
function TestingEditor({ testing, setTesting, disabled = false }) {
  const total = num(testing.MS) + num(testing.HSD);
  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>Daily fuel testing</h3>
      <div className="panel">
        <div className="body">
          <div className="form-grid">
            <Field label="MS (petrol) tested" hint="value in rupees">
              <input
                className="mono"
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={testing.MS}
                disabled={disabled}
                placeholder="0.00"
                onChange={(e) => setTesting((t) => ({ ...t, MS: e.target.value }))}
              />
            </Field>
            <Field label="HSD (diesel) tested" hint="value in rupees">
              <input
                className="mono"
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={testing.HSD}
                disabled={disabled}
                placeholder="0.00"
                onChange={(e) => setTesting((t) => ({ ...t, HSD: e.target.value }))}
              />
            </Field>
          </div>
          <div className="divider" />
          <div className="small muted">
            Tested fuel returns to the tank, so{" "}
            <span className="mono">{money(total)}</span> is deducted from gross sales
            and is not owed to the owner.
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The settlement strip. Ends on the one figure that matters at the counter:
 * the physical cash to hand over.
 */
function HandoverSummary({ totals }) {
  const short = num(totals.variance) < -VARIANCE_TOLERANCE;
  const over = num(totals.variance) > VARIANCE_TOLERANCE;
  return (
    <div className="panel">
      <div className="body row" style={{ gap: 36, flexWrap: "wrap" }}>
        <Stat label="Gross sales" value={money(totals.gross)} />
        <Stat label="Less testing" value={money(totals.testingTotal)} />
        <Stat label="Less expenses" value={money(totals.expensesTotal)} />
        <Stat label="Net due" value={money(totals.net)} />
        <Stat label="Card / UPI / credit" value={money(totals.nonCash)} />
        <Stat label="Cash to hand over" value={money(totals.handover)} tone="pos" />
        <Stat
          label={`Variance · ${varianceLabel(totals.variance)}`}
          value={totals.variance == null ? "—" : money(totals.variance)}
          tone={varianceTone(totals.variance)}
        />
      </div>
      {(short || over) && (
        <div className="body" style={{ borderTop: "1px solid var(--hairline)" }}>
          <span className="small" style={{ color: short ? "var(--rust)" : "var(--green)" }}>
            {short
              ? `Collections are short of net by ₹ ${money(Math.abs(totals.variance))}. Check the payment split before submitting.`
              : `Collections exceed net by ₹ ${money(totals.variance)}. Confirm nothing was counted twice.`}
          </span>
        </div>
      )}
    </div>
  );
}

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

/**
 * Credit sales. A regular can be picked from the ledger, but the common case
 * is a walk-in — so a name and phone are enough. Unknown payers are registered
 * as customers when the shift is submitted, so no debt is ever anonymous.
 */
function CreditEditor({ rows, setRows, customers, disabled = false }) {
  const patch = (i, fields) =>
    setRows((r) => {
      const next = [...r];
      next[i] = { ...next[i], ...fields };
      return next;
    });

  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3>Credit sales this shift</h3>
        {!disabled && (
          <button
            type="button"
            className="small"
            onClick={() =>
              setRows((r) => [...r, { customerId: "", name: "", phone: "", amount: "" }])
            }
          >
            Add credit sale
          </button>
        )}
      </div>
      <div className="panel flush">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Name</th>
              <th>Phone</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted small">
                  None recorded.
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const known = customers.find((c) => c.id === row.customerId);
              return (
                <tr key={i}>
                  <td style={{ width: 200 }}>
                    <select
                      value={row.customerId || ""}
                      disabled={disabled}
                      onChange={(e) => {
                        const c = customers.find((x) => x.id === e.target.value);
                        patch(i, {
                          customerId: e.target.value,
                          name: c ? c.name : row.name,
                          phone: c ? c.phone || "" : row.phone,
                        });
                      }}
                    >
                      <option value="">New / walk-in</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={row.name || ""}
                      disabled={disabled || !!known}
                      placeholder="Customer name"
                      onChange={(e) => patch(i, { name: e.target.value })}
                    />
                  </td>
                  <td style={{ width: 170 }}>
                    <input
                      className="mono"
                      inputMode="tel"
                      value={row.phone || ""}
                      disabled={disabled || !!known}
                      placeholder="10-digit mobile"
                      onChange={(e) => patch(i, { phone: e.target.value })}
                    />
                  </td>
                  <td className="num" style={{ width: 150 }}>
                    <input
                      className="mono"
                      inputMode="decimal"
                      style={{ textAlign: "right" }}
                      value={row.amount}
                      disabled={disabled}
                      placeholder="0.00"
                      onChange={(e) => patch(i, { amount: e.target.value })}
                    />
                  </td>
                  <td style={{ width: 40 }}>
                    {!disabled && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                      >
                        remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        A walk-in is matched on phone number; if the number is new, a customer
        account is opened automatically so the balance can be chased later.
      </div>
    </div>
  );
}

/** Small status chip for the settled-shifts register. */
function StatusTag({ status }) {
  if (status === SHIFT_STATUS.APPROVED) return <span className="tag green">Approved</span>;
  if (status === SHIFT_STATUS.REJECTED) return <span className="tag rust">Sent back</span>;
  return <span className="tag">Pending review</span>;
}

/**
 * The owner's review of a handed-in shift. Until it is approved, expenses,
 * testing and the payment split all stay editable — mistakes get caught here,
 * not with a correction entry three days later.
 */
function ClosedShiftDetail({
  shift,
  totals,
  customers = [],
  canReview = false,
  busy = false,
  onRevise,
  onApprove,
  onReject,
}) {
  const locked = shift.status === SHIFT_STATUS.APPROVED;
  const [editing, setEditing] = useState(false);
  const [expenses, setExpenses] = useState(shift.expenses || []);
  const [testing, setTesting] = useState({
    MS: shift.testing?.MS ?? "",
    HSD: shift.testing?.HSD ?? "",
  });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  // Re-sync whenever the shift reloads under us.
  useEffect(() => {
    setExpenses(shift.expenses || []);
    setTesting({ MS: shift.testing?.MS ?? "", HSD: shift.testing?.HSD ?? "" });
    setEditing(false);
  }, [shift]);

  const draft = useMemo(
    () => (editing ? shiftTotals({ ...shift, expenses, testing }) : totals),
    [editing, shift, expenses, testing, totals]
  );

  return (
    <div className="stack" style={{ gap: 16, padding: "4px 0" }}>
      {shift.status === SHIFT_STATUS.REJECTED && shift.rejectionReason && (
        <Notice kind="error">
          Sent back by {shift.rejectedByName || "the owner"}: {shift.rejectionReason}
        </Notice>
      )}
      {locked && (
        <Notice kind="good">
          Approved by {shift.approvedByName || "the owner"}
          {shift.approvedAt ? ` on ${formatStamp(shift.approvedAt)}` : ""}. This shift is
          now locked.
        </Notice>
      )}

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

          <h3 style={{ margin: "14px 0 6px" }}>Litres by product</h3>
          <table>
            <tbody>
              <tr>
                <td>MS (petrol)</td>
                <td className="num mono">{money(totals.litresByGroup.MS)}</td>
              </tr>
              <tr>
                <td>HSD (diesel)</td>
                <td className="num mono">{money(totals.litresByGroup.HSD)}</td>
              </tr>
              {totals.litresByGroup.OTHER > 0 && (
                <tr>
                  <td>Other</td>
                  <td className="num mono">{money(totals.litresByGroup.OTHER)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ flex: "1 1 300px", minWidth: 280 }}>
          <h3 style={{ marginBottom: 6 }}>Settlement</h3>
          <table>
            <tbody>
              <tr>
                <td>Gross sales</td>
                <td className="num mono">{money(draft.gross)}</td>
              </tr>
              <tr>
                <td>Testing · MS</td>
                <td className="num mono">−{money(draft.testingMS)}</td>
              </tr>
              <tr>
                <td>Testing · HSD</td>
                <td className="num mono">−{money(draft.testingHSD)}</td>
              </tr>
              <tr>
                <td>Expenses</td>
                <td className="num mono">−{money(draft.expensesTotal)}</td>
              </tr>
              <tr className="total">
                <td>Net due</td>
                <td className="num mono">{money(draft.net)}</td>
              </tr>
              {PAYMENT_MODES.map((mode) => (
                <tr key={mode}>
                  <td className="muted">{PAYMENT_LABELS[mode]}</td>
                  <td className="num mono">{money(draft.payments[mode])}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Collected</td>
                <td className="num mono">{money(draft.declared)}</td>
              </tr>
              <tr>
                <td className="muted">Less card / UPI / credit</td>
                <td className="num mono">−{money(draft.nonCash)}</td>
              </tr>
              <tr className="total">
                <td>Cash to owner</td>
                <td className="num mono">{money(draft.handover)}</td>
              </tr>
              <tr className="total">
                <td>Variance · {varianceLabel(draft.variance)}</td>
                <td
                  className="num mono"
                  style={{
                    color:
                      varianceTone(draft.variance) === "neg"
                        ? "var(--rust)"
                        : "var(--green)",
                  }}
                >
                  {money(draft.variance)}
                </td>
              </tr>
            </tbody>
          </table>

          {shift.note && (
            <>
              <div className="divider" />
              <div className="small">
                <span className="muted">Note: </span>
                {shift.note}
              </div>
            </>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>
            Closed by {shift.closedByName || shift.employeeName}
            {shift.endTime ? ` · ${formatStamp(shift.endTime)}` : ""}
            {shift.revisedByName ? ` · revised by ${shift.revisedByName}` : ""}
          </div>
        </div>
      </div>

      {/* -------- expenses & testing: editable until approved -------- */}
      {editing ? (
        <div className="stack" style={{ gap: 14 }}>
          <LineEditor
            title="Expenses paid from the drawer"
            rows={expenses}
            setRows={setExpenses}
            labelPlaceholder="Power bill"
            addLabel="Add expense"
          />
          <TestingEditor testing={testing} setTesting={setTesting} />
          <div className="row">
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await onRevise({ expenses, testing });
                if (ok) setEditing(false);
              }}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setExpenses(shift.expenses || []);
                setTesting({
                  MS: shift.testing?.MS ?? "",
                  HSD: shift.testing?.HSD ?? "",
                });
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3>Expenses &amp; testing</h3>
            {!locked && (
              <button type="button" className="small" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          <table>
            <tbody>
              {(shift.expenses || []).map((e, i) => (
                <tr key={i}>
                  <td>{e.label || "—"}</td>
                  <td className="num mono">{money(e.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="muted">Testing · MS</td>
                <td className="num mono">{money(totals.testingMS)}</td>
              </tr>
              <tr>
                <td className="muted">Testing · HSD</td>
                <td className="num mono">{money(totals.testingHSD)}</td>
              </tr>
              <tr className="total">
                <td>Total deducted</td>
                <td className="num mono">
                  {money(totals.expensesTotal + totals.testingTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {(shift.creditSales || []).length > 0 && (
        <div>
          <h3 style={{ marginBottom: 6 }}>Credit sales</h3>
          <table>
            <tbody>
              {shift.creditSales.map((c, i) => {
                const known = customers.find((x) => x.id === c.customerId);
                return (
                  <tr key={i}>
                    <td>{known?.name || c.name || "Walk-in"}</td>
                    <td className="mono small muted">{c.phone || known?.phone || "—"}</td>
                    <td className="num mono">{money(c.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* -------- owner sign-off -------- */}
      {canReview && !locked && (
        <div className="panel">
          <div className="body stack" style={{ gap: 10 }}>
            <div className="between">
              <div>
                <strong>Owner sign-off</strong>
                <div className="small muted">
                  Approving locks the shift and records{" "}
                  <span className="mono">{money(totals.handover)}</span> as cash received.
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={onApprove}
                >
                  Approve
                </button>
                {shift.status === SHIFT_STATUS.PENDING_REVIEW && (
                  <button type="button" disabled={busy} onClick={() => setRejecting((r) => !r)}>
                    Send back
                  </button>
                )}
              </div>
            </div>
            {rejecting && (
              <div className="row" style={{ gap: 8 }}>
                <input
                  style={{ flex: 1 }}
                  value={reason}
                  placeholder="What needs correcting?"
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    const ok = await onReject(reason.trim());
                    if (ok) {
                      setReason("");
                      setRejecting(false);
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
