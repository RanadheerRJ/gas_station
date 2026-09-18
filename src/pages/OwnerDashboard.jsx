import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import { LoadingPanels } from "../components/motion.jsx";
import { useStations } from "../state/useStations";
import {
  addStation,
  setStationState,
  listCustomers,
  listShifts,
  readableError,
} from "../lib/api";
import { money, todayISO } from "../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceTone } from "../lib/shiftMath";

export default function OwnerDashboard() {
  const { stations, loading, reload } = useStations();
  const [summaries, setSummaries] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);

  // Per-station roll-up: today’s sales, today’s cash, total outstanding credit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      const out = {};
      await Promise.all(
        stations.map(async (s) => {
          try {
            const [shifts, customers] = await Promise.all([
              listShifts(s.id),
              listCustomers(s.id),
            ]);
            const todays = shifts.filter(
              (sh) => sh.date === today && sh.status !== SHIFT_STATUS.OPEN
            );
            const totals = todays.map(shiftTotals);
            out[s.id] = {
              sales: totals.reduce((n, t) => n + t.gross, 0),
              litres: totals.reduce((n, t) => n + t.totalLitres, 0),
              cash: totals.reduce((n, t) => n + (t.declared ?? 0), 0),
              testing: totals.reduce((n, t) => n + t.testingTotal, 0),
              handover: totals.reduce((n, t) => n + t.handover, 0),
              pending: shifts.filter(
                (sh) =>
                  sh.status === SHIFT_STATUS.PENDING_REVIEW ||
                  sh.status === SHIFT_STATUS.REJECTED
              ).length,
              variance: totals.reduce((n, t) => n + (t.variance ?? 0), 0),
              outstanding: customers.reduce(
                (n, c) => n + Number(c.outstandingBalance || 0),
                0
              ),
              openShifts: shifts.filter((sh) => sh.status === "open"),
              closedToday: todays.length,
              approvedToday: todays.filter((sh) => sh.status === SHIFT_STATUS.APPROVED)
                .length,
            };
          } catch {
            out[s.id] = null;
          }
        })
      );
      if (!cancelled) setSummaries(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [stations]);

  const totals = useMemo(() => {
    const vals = Object.values(summaries).filter(Boolean);
    return {
      sales: vals.reduce((n, v) => n + v.sales, 0),
      litres: vals.reduce((n, v) => n + v.litres, 0),
      cash: vals.reduce((n, v) => n + v.cash, 0),
      testing: vals.reduce((n, v) => n + v.testing, 0),
      handover: vals.reduce((n, v) => n + v.handover, 0),
      pending: vals.reduce((n, v) => n + v.pending, 0),
      variance: vals.reduce((n, v) => n + v.variance, 0),
      outstanding: vals.reduce((n, v) => n + v.outstanding, 0),
    };
  }, [summaries]);

  const submitStation = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await addStation({ name: form.name.trim(), address: form.address.trim() });
      setForm({ name: "", address: "" });
      setShowAdd(false);
      await reload();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStationState = async (station, state) => {
    setError("");
    setBusy(true);
    try {
      await setStationState(station.id, state);
      setDeleting(null);
      await reload();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="All stations"
        sub={`${stations.length} station${stations.length === 1 ? "" : "s"} · figures for ${todayISO()}`}
      />
      <div className="content stack">
        <Panel title="Combined position today">
          <div className="row" style={{ gap: 40 }}>
            {/* These figures move as shifts are approved through the day, so
                they count to the new value instead of snapping. */}
            <Stat label="Litres sold" amount={totals.litres} format={money} />
            <Stat label="Fuel sales" amount={totals.sales} format={money} prefix="₹ " />
            <Stat label="Testing" amount={totals.testing} format={money} prefix="₹ " />
            <Stat label="Cash declared" amount={totals.cash} format={money} prefix="₹ " />
            <Stat
              label="Cash to receive"
              amount={totals.handover}
              format={money}
              prefix="₹ "
              tone="pos"
            />
            <Stat
              label="Cash variance"
              amount={totals.variance}
              format={money}
              prefix="₹ "
              tone={varianceTone(totals.variance)}
            />
            <Stat
              label="Outstanding credit"
              amount={totals.outstanding}
              format={money}
              prefix="₹ "
              tone={totals.outstanding > 0 ? "neg" : "pos"}
            />
          </div>
        </Panel>

        {totals.pending > 0 && (
          <Notice>
            {totals.pending} shift{totals.pending === 1 ? "" : "s"} awaiting your
            sign-off. Open a station’s shift register to review the figures, adjust
            expenses or testing, and approve.
          </Notice>
        )}

        <Panel
          title="Stations"
          flush
          actions={
            <button type="button" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add station"}
            </button>
          }
        >
          {showAdd && (
            <form
              className="stack"
              onSubmit={submitStation}
              style={{ padding: 14, borderBottom: "1px solid var(--hairline)" }}
            >
              <div className="form-grid">
                <Field label="Station name">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="City Centre Filling Station"
                  />
                </Field>
                <Field label="Address">
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Beside RTO Office, Karimnagar"
                  />
                </Field>
              </div>
              {error && <Notice kind="error">{error}</Notice>}
              <div>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !form.name.trim() || !form.address.trim()}
                >
                  {busy ? "Adding…" : "Add station"}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <LoadingPanels count={2} lines={3} label="Loading stations" />
          ) : stations.length === 0 ? (
            <Empty>No stations yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Station</th>
                  <th className="num">Litres</th>
                  <th className="num">Sales today</th>
                  <th className="num">Variance</th>
                  <th className="num">Outstanding credit</th>
                  <th>Shift</th>
                  <th className="num" style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => {
                  const sum = summaries[s.id];
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {s.name}
                          {s.state === "archived" && (
                            <span className="tag" style={{ marginLeft: 6 }}>
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="small muted">{s.address}</div>
                      </td>
                      <td className="num mono">{sum ? money(sum.litres) : "—"}</td>
                      <td className="num mono">{sum ? money(sum.sales) : "—"}</td>
                      <td
                        className="num mono"
                        style={{
                          color:
                            sum && varianceTone(sum.variance) === "neg"
                              ? "var(--rust)"
                              : "var(--green)",
                        }}
                      >
                        {sum ? money(sum.variance) : "—"}
                      </td>
                      <td className="num mono">{sum ? money(sum.outstanding) : "—"}</td>
                      <td>
                        {!sum ? (
                          <span className="muted small">—</span>
                        ) : sum.openShifts?.length ? (
                          <span className="tag">{sum.openShifts.length} open</span>
                        ) : sum.closedToday > 0 ? (
                          <span className="tag green">{sum.closedToday} closed</span>
                        ) : (
                          <span className="tag rust">none today</span>
                        )}
                        {sum?.pending > 0 && (
                          <span className="tag" style={{ marginLeft: 6 }}>
                            {sum.pending} to review
                          </span>
                        )}
                      </td>
                      <td className="num">
                        <span
                          className="row"
                          style={{ gap: 10, justifyContent: "flex-end" }}
                        >
                          <Link className="small" to={`/owner/shifts?station=${s.id}`}>
                            Shifts
                          </Link>
                          {s.state === "archived" ? (
                            <button
                              type="button"
                              className="quiet"
                              disabled={busy}
                              onClick={() => changeStationState(s, "active")}
                            >
                              reopen
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => {
                                setError("");
                                setDeleting(deleting?.id === s.id ? null : s);
                              }}
                            >
                              archive
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num mono">{money(totals.litres)}</td>
                  <td className="num mono">{money(totals.sales)}</td>
                  <td className="num mono">{money(totals.variance)}</td>
                  <td className="num mono">{money(totals.outstanding)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
        {deleting && (
          <Panel title={`Archive ${deleting.name}`}>
            <div className="stack" style={{ gap: 10 }}>
              <Notice>
                Archiving hides this station from the day-to-day screens. Nothing is
                deleted — its shifts, ledger and credit history stay intact, and you can
                reopen it from this page at any time.
              </Notice>
              {error && <Notice kind="error">{error}</Notice>}
              <div className="row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeStationState(deleting, "archived")}
                >
                  {busy ? "Archiving…" : `Archive ${deleting.name}`}
                </button>
                <button type="button" onClick={() => setDeleting(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
