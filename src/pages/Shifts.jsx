import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { CashIcon, GaugeIcon, PumpIcon, ShiftIcon, StatusDot } from "../components/icons";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  addShiftExpense,
  approveShift,
  closeShift,
  listCustomers,
  listNozzleOccupancy,
  listPumps,
  listShifts,
  openShift,
  readableError,
  rejectShift,
  removeShiftExpense,
  reviseShift,
} from "../lib/api";
import { formatDate, formatStamp, money, num } from "../lib/format";
import {
  PAYMENT_LABELS,
  PAYMENT_MODES,
  SHIFT_STATUS,
  VARIANCE_TOLERANCE,
  ANONYMOUS_OPERATOR,
  anonymousNozzleOccupancy,
  litresBetween,
  nozzleOccupancy,
  pumpOccupancy,
  shiftTotals,
  validateClosing,
  varianceLabel,
  varianceTone,
} from "../lib/shiftMath";
import {
  LoadingPanels,
  NumberRoll,
  prefersReducedMotion,
  useOneShot,
  useStatusChange,
} from "../components/motion.jsx";

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
  const [busyNozzleIds, setBusyNozzleIds] = useState([]);
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

  const isAttendant = profile.role === "attendant";

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      // An attendant is only entitled to their own shifts plus anonymous
      // nozzle availability. Asking for the customer directory or the
      // station's other shifts would be refused by RLS anyway — not
      // requesting them keeps the screen honest about what it needs.
      const [sh, eq, cust, busy] = await Promise.all([
        listShifts(stationId),
        listPumps(stationId),
        isAttendant ? Promise.resolve([]) : listCustomers(stationId),
        isAttendant ? listNozzleOccupancy(stationId) : Promise.resolve([]),
      ]);
      setShifts(sh);
      setPumps(eq.pumps);
      setNozzles(eq.nozzles);
      setCustomers(cust);
      setBusyNozzleIds(busy);
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, isAttendant]);

  useEffect(() => {
    load();
  }, [load]);

  const openShifts = shifts.filter((s) => s.status === SHIFT_STATUS.OPEN);
  // Everything that has been handed in: awaiting review, sent back, or signed off.
  const settled = shifts.filter((s) => s.status !== SHIFT_STATUS.OPEN);
  const awaiting = settled.filter((s) => s.status !== SHIFT_STATUS.APPROVED);
  const station = stations.find((s) => s.id === stationId);
  const canReview = profile.role === "owner" || profile.role === "manager";

  // Attendants get availability from the anonymous RPC; owners and managers
  // derive it from the shift data they are entitled to see, which also names
  // the operator on each pump.
  const nozzleBusy = useMemo(
    () =>
      isAttendant ? anonymousNozzleOccupancy(busyNozzleIds) : nozzleOccupancy(openShifts),
    [isAttendant, busyNozzleIds, openShifts]
  );

  const occupancy = useMemo(() => {
    const board = pumpOccupancy(pumps, nozzles, openShifts);
    if (!isAttendant) return board;
    // Rebuild from the anonymous map so a pump held by a co-worker still
    // reads as busy even though its shift row is invisible here.
    Object.entries(board).forEach(([pumpId, entry]) => {
      const mine = nozzles.filter((n) => n.pumpId === pumpId);
      const held = mine.filter((n) => nozzleBusy[n.id]);
      board[pumpId] = {
        ...entry,
        busy: held.length > 0,
        operators: held.length ? [ANONYMOUS_OPERATOR] : [],
        heldNozzleIds: held.map((n) => n.id),
      };
    });
    return board;
  }, [pumps, nozzles, openShifts, isAttendant, nozzleBusy]);

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

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await openShift(stationId, { employeeName: profile.name, nozzleIds: picked });
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
          <LoadingPanels count={1} lines={2} />
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
              <button
                type="button"
                onClick={() => {
                  setStarting(false);
                  setPicked([]);
                }}
              >
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
              canEnterCredit={!isAttendant}
              busy={busy}
              onCancel={() => setClosingFor(null)}
              onSubmit={async (payload) => {
                setBusy(true);
                setError("");
                try {
                  await closeShift(stationId, s.id, payload);
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
                          <span
                            className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`}
                          />
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

              {/* Expenses are logged as they are paid, so closing is quick. */}
              <ShiftExpenses
                shift={s}
                busy={busy}
                onAdd={(expense) => run(() => addShiftExpense(stationId, s.id, expense))}
                onRemove={(i) => run(() => removeShiftExpense(stationId, s.id, i))}
              />
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
              ? `${awaiting.length} awaiting the owner’s sign-off`
              : "All shifts signed off."
          }
          flush
        >
          {loading ? (
            <LoadingPanels count={2} lines={4} label="Loading shifts" />
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
                                run(() => reviseShift(stationId, s.id, patch))
                              }
                              onApprove={() => run(() => approveShift(stationId, s.id))}
                              onReject={(reason) =>
                                run(() => rejectShift(stationId, s.id, reason))
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

function CloseShiftPanel({
  shift,
  customers,
  onSubmit,
  onCancel,
  busy,
  canEnterCredit = true,
}) {
  const [closings, setClosings] = useState({});
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

  // Expenses were logged during the shift and are not re-entered here.
  // Memoised so the empty-array fallback is not a fresh object each render,
  // which would retrigger the totals useMemo below on every keystroke.
  const expenses = useMemo(() => shift.expenses || [], [shift.expenses]);

  const preview = useMemo(
    () =>
      shiftTotals({ nozzles: withClosings, expenses, creditSales, payments, testing }),
    [withClosings, expenses, creditSales, payments, testing]
  );

  // Without the customer directory there is no way to attribute a credit
  // sale, so that payment mode is not offered at all.
  const visibleModes = useMemo(
    () => (canEnterCredit ? PAYMENT_MODES : PAYMENT_MODES.filter((m) => m !== "credit")),
    [canEnterCredit]
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
      // Never send credit rows the operator was not allowed to enter; the
      // database refuses them anyway.
      creditSales: canEnterCredit ? creditSales : [],
      payments: canEnterCredit ? payments : { ...payments, credit: "" },
      testing,
      note,
    });
  };

  return (
    <Panel
      title={
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <GaugeIcon /> Close {shift.employeeName}’s shift
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
                          <span
                            className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`}
                          />
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

        {expenses.length > 0 && (
          <div>
            <h3 style={{ marginBottom: 8 }}>Expenses logged this shift</h3>
            <div className="panel flush">
              <table>
                <tbody>
                  {expenses.map((e, i) => (
                    <tr key={i}>
                      <td>{e.label}</td>
                      <td className="num mono" style={{ width: 150 }}>
                        {money(e.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="num mono">{money(preview.expensesTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <TestingEditor testing={testing} setTesting={setTesting} />

        {canEnterCredit ? (
          <CreditEditor
            rows={creditSales}
            setRows={setCreditSales}
            customers={customers}
          />
        ) : (
          <Notice kind="info">
            💳 Credit sales are added by your manager. Hand the docket over at the end of
            your shift and record the rest of the money below.
          </Notice>
        )}

        <div>
          <h3 className="row" style={{ gap: 7, alignItems: "center", marginBottom: 8 }}>
            <CashIcon size={16} /> What you collected
          </h3>
          <div className="form-grid">
            {visibleModes.map((mode) => (
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
                  onChange={(e) => setPayments((p) => ({ ...p, [mode]: e.target.value }))}
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
 * Running expense log for an open shift. Money paid out of the drawer is
 * recorded the moment it happens, so closing the shift is just readings and
 * a cash count rather than an exercise in memory.
 */
function ShiftExpenses({ shift, busy, onAdd, onRemove }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  // Counts rejected submissions so the amount box knocks each time, not just
  // the first time.
  const [rejects, setRejects] = useState(0);
  // The row being removed is held for the length of its collapse, so the rows
  // below slide up instead of jumping.
  const [removing, setRemoving] = useState(null);
  const amountShake = useOneShot(rejects, { className: "shake" });

  const rows = shift.expenses || [];
  const total = rows.reduce((n, e) => n + num(e.amount), 0);
  const ready = label.trim() && num(amount) > 0;

  const submit = async () => {
    if (!ready) {
      setRejects((n) => n + 1);
      return;
    }
    const ok = await onAdd({ label: label.trim(), amount: num(amount) });
    if (ok) {
      setLabel("");
      setAmount("");
    } else {
      setRejects((n) => n + 1);
    }
  };

  // Expenses are keyed by position, so the collapse has to finish before the
  // row actually leaves the array or the wrong row would animate.
  const remove = (index) => {
    if (prefersReducedMotion()) {
      onRemove(index);
      return;
    }
    setRemoving(index);
    setTimeout(() => {
      setRemoving(null);
      onRemove(index);
    }, 180);
  };

  return (
    <div className="body" style={{ borderTop: "1px solid var(--hairline)" }}>
      <div className="between" style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Expenses paid from the drawer</strong>
        <span className="small muted">
          Total <span className="mono">{money(total)}</span>
        </span>
      </div>

      {rows.length > 0 && (
        <table style={{ marginBottom: 8 }}>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className={removing === i ? "row-exit" : "row-enter"}>
                <td>{e.label}</td>
                <td className="num mono" style={{ width: 130 }}>
                  {money(e.amount)}
                </td>
                <td className="num" style={{ width: 70 }}>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || removing !== null}
                    onClick={() => remove(i)}
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <input
          style={{ flex: 1, minWidth: 160 }}
          value={label}
          placeholder="What was paid for"
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <input
          className={`mono ${amountShake}`.trim()}
          inputMode="decimal"
          style={{ textAlign: "right", width: 130 }}
          value={amount}
          placeholder="0.00"
          disabled={busy}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button type="button" disabled={busy || !ready} onClick={submit}>
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * Daily fuel testing. Every pump is test-dispensed each day and the fuel goes
 * back into the tank, so the money was never collected — it comes off gross
 * before anything is owed to the owner.
 */
function TestingEditor({ testing, setTesting, disabled = false }) {
  const total = num(testing.MS) + num(testing.HSD);
  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3>Fuel tested today</h3>
        <span className="small muted">
          Goes back in the tank · <span className="mono">{money(total)}</span> off gross
        </span>
      </div>
      <div className="form-grid">
        <Field label="MS (petrol)" hint="₹">
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
        <Field label="HSD (diesel)" hint="₹">
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
      <div className="body">
        <table>
          <tbody>
            <tr>
              <td>Fuel sold</td>
              <td className="num mono">{money(totals.gross)}</td>
            </tr>
            <tr>
              <td className="muted">Less fuel tested</td>
              <td className="num mono">−{money(totals.testingTotal)}</td>
            </tr>
            <tr>
              <td className="muted">Less expenses</td>
              <td className="num mono">−{money(totals.expensesTotal)}</td>
            </tr>
            <tr className="total">
              <td>Net due</td>
              <td className="num mono">
                {/* Recomputes as expenses and testing are entered, so it
                    counts to the new figure rather than jumping. */}
                <NumberRoll value={totals.net} format={money} />
              </td>
            </tr>
            <tr>
              <td className="muted">Less card, UPI &amp; credit</td>
              <td className="num mono">−{money(totals.nonCash)}</td>
            </tr>
            <tr className="total">
              <td>Cash to hand over</td>
              <td className="num mono" style={{ color: "var(--green)" }}>
                <NumberRoll value={totals.handover} format={money} />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="divider" />
        <div className="between">
          <span className="small muted">
            Counted {money(totals.declared)} against {money(totals.net)} due
          </span>
          <span
            className="small mono"
            style={{
              color: short ? "var(--rust)" : over ? "var(--green)" : "var(--muted)",
            }}
          >
            {short
              ? `Short by ${money(Math.abs(totals.variance))}`
              : over
                ? `Over by ${money(totals.variance)}`
                : "Balanced"}
          </span>
        </div>
      </div>
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
        A walk-in is matched on phone number; if the number is new, a customer account is
        opened automatically so the balance can be chased later.
      </div>
    </div>
  );
}

/**
 * Small status chip for the settled-shifts register.
 *
 * A shift moving from pending review to approved or sent back is the whole
 * point of this screen, so the chip marks itself for one beat when the status
 * changes rather than silently swapping colour.
 */
function StatusTag({ status }) {
  const changed = useStatusChange(status);
  const tone =
    status === SHIFT_STATUS.APPROVED
      ? " green"
      : status === SHIFT_STATUS.REJECTED
        ? " rust"
        : "";
  const label =
    status === SHIFT_STATUS.APPROVED
      ? "Approved"
      : status === SHIFT_STATUS.REJECTED
        ? "Sent back"
        : "Pending review";
  return (
    <span className={`tag${tone}`} data-changed={changed || undefined}>
      {label}
    </span>
  );
}

/**
 * The owner’s review of a handed-in shift. Until it is approved, expenses,
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
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRejecting((r) => !r)}
                  >
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
