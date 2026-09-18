import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  addStation,
  listCustomers,
  listShifts,
  readableError,
} from "../lib/api";
import { money, todayISO } from "../lib/format";
import { shiftTotals, varianceTone } from "../lib/shiftMath";
import { PumpIcon, ShiftIcon, StationIcon } from "../components/icons";

export default function OwnerDashboard() {
  const { profile } = useAuth();
  const { stations, loading, reload } = useStations();
  const [summaries, setSummaries] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Per-station roll-up: today's sales, today's cash, total outstanding credit.
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
            const todays = shifts.filter((sh) => sh.date === today && sh.status === "closed");
            const totals = todays.map(shiftTotals);
            out[s.id] = {
              sales: totals.reduce((n, t) => n + t.grossSales, 0),
              litres: totals.reduce((n, t) => n + t.totalLitres, 0),
              cash: totals.reduce((n, t) => n + (t.declared ?? 0), 0),
              variance: totals.reduce((n, t) => n + (t.variance ?? 0), 0),
              outstanding: customers.reduce(
                (n, c) => n + Number(c.outstandingBalance || 0),
                0
              ),
              openShift: shifts.find((sh) => sh.status === "open") || null,
              closedToday: todays.length,
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
      variance: vals.reduce((n, v) => n + v.variance, 0),
      outstanding: vals.reduce((n, v) => n + v.outstanding, 0),
    };
  }, [summaries]);

  const submitStation = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await addStation(
        { name: form.name.trim(), address: form.address.trim() },
        profile
      );
      setForm({ name: "", address: "" });
      setShowAdd(false);
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
            <Stat label="Litres sold" value={money(totals.litres)} />
            <Stat label="Fuel sales" value={`₹ ${money(totals.sales)}`} />
            <Stat label="Cash declared" value={`₹ ${money(totals.cash)}`} />
            <Stat
              label="Cash variance"
              value={`₹ ${money(totals.variance)}`}
              tone={varianceTone(totals.variance)}
            />
            <Stat
              label="Outstanding credit"
              value={`₹ ${money(totals.outstanding)}`}
              tone={totals.outstanding > 0 ? "neg" : "pos"}
            />
          </div>
        </Panel>

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
            <Empty>Loading stations…</Empty>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => {
                  const sum = summaries[s.id];
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
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
                      <td className="num mono">
                        {sum ? money(sum.outstanding) : "—"}
                      </td>
                      <td>
                        {!sum ? (
                          <span className="muted small">—</span>
                        ) : sum.openShift ? (
                          <span className="tag">{sum.openShift.name} open</span>
                        ) : sum.closedToday > 0 ? (
                          <span className="tag green">
                            {sum.closedToday} closed
                          </span>
                        ) : (
                          <span className="tag rust">none today</span>
                        )}
                      </td>
                      <td className="num">
                        <Link className="small" to={`/owner/shifts?station=${s.id}`}>
                          Shifts
                        </Link>
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
      </div>
    </>
  );
}
