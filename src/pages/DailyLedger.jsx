import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { LedgerIcon, StatusDot } from "../components/icons";
import { useStations } from "../state/useStations";
import { listShifts, readableError } from "../lib/api";
import { formatDate, formatStamp, money } from "../lib/format";
import { shiftTotals, varianceLabel, varianceTone } from "../lib/shiftMath";

/**
 * The daily ledger is now entirely DERIVED from closed shifts — there is no
 * manual sales entry anywhere. Each day rolls up its shifts; expanding a day
 * shows the individual shifts that made it.
 */
export default function DailyLedger() {
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();
  const [stationId, setStationId] = useState("");
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      setShifts((await listShifts(stationId)).filter((s) => s.status === "closed"));
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

  // Group closed shifts by date and total each day.
  const days = useMemo(() => {
    const byDate = new Map();
    shifts.forEach((s) => {
      const t = shiftTotals(s);
      const d = byDate.get(s.date) || {
        date: s.date,
        shifts: [],
        litres: 0,
        sales: 0,
        credit: 0,
        digital: 0,
        expenses: 0,
        expected: 0,
        declared: 0,
        variance: 0,
        fuels: {},
      };
      d.shifts.push({ shift: s, totals: t });
      d.litres += t.totalLitres;
      d.sales += t.grossSales;
      d.credit += t.creditTotal;
      d.digital += t.digital;
      d.expenses += t.expensesTotal;
      d.expected += t.expectedCash;
      d.declared += t.declared ?? 0;
      d.variance += t.variance ?? 0;
      Object.entries(t.fuels).forEach(([fuel, v]) => {
        d.fuels[fuel] ||= { litres: 0, amount: 0 };
        d.fuels[fuel].litres += v.litres;
        d.fuels[fuel].amount += v.amount;
      });
      byDate.set(s.date, d);
    });
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [shifts]);

  const month = new Date().toISOString().slice(0, 7);
  const monthTotals = useMemo(() => {
    const rows = days.filter((d) => d.date.startsWith(month));
    return {
      days: rows.length,
      litres: rows.reduce((n, d) => n + d.litres, 0),
      sales: rows.reduce((n, d) => n + d.sales, 0),
      credit: rows.reduce((n, d) => n + d.credit, 0),
      variance: rows.reduce((n, d) => n + d.variance, 0),
    };
  }, [days, month]);

  const station = stations.find((s) => s.id === stationId);

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Daily ledger" />
        <div className="content">
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Daily ledger"
        sub={station ? `${station.name} · totalled from closed shifts` : ""}
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

        <Panel title={`This month · ${monthTotals.days} day${monthTotals.days === 1 ? "" : "s"}`}>
          <div className="row" style={{ gap: 40 }}>
            <Stat label="Litres sold" value={money(monthTotals.litres)} />
            <Stat label="Fuel sales" value={`₹ ${money(monthTotals.sales)}`} />
            <Stat label="On credit" value={`₹ ${money(monthTotals.credit)}`} />
            <Stat
              label="Cash variance"
              value={`₹ ${money(monthTotals.variance)}`}
              tone={varianceTone(monthTotals.variance)}
            />
          </div>
        </Panel>

        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <LedgerIcon /> Day register
            </span>
          }
          note="Every figure here comes from meter readings — nothing is typed by hand."
          flush
        >
          {loading ? (
            <Empty>Loading…</Empty>
          ) : days.length === 0 ? (
            <Empty>
              No closed shifts yet. Sales appear here once a shift is closed with its
              meter readings.
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Shifts</th>
                  <th className="num">Litres</th>
                  <th className="num">Sales</th>
                  <th className="num">Credit</th>
                  <th className="num">Expenses</th>
                  <th className="num">Cash declared</th>
                  <th className="num">Variance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const open = expanded === d.date;
                  return (
                    <Fragment key={d.date}>
                      <tr>
                        <td className="mono small">{formatDate(d.date)}</td>
                        <td className="num mono">{d.shifts.length}</td>
                        <td className="num mono">{money(d.litres)}</td>
                        <td className="num mono">{money(d.sales)}</td>
                        <td className="num mono">{money(d.credit)}</td>
                        <td className="num mono">{money(d.expenses)}</td>
                        <td className="num mono">{money(d.declared)}</td>
                        <td
                          className="num mono"
                          style={{
                            color:
                              varianceTone(d.variance) === "neg"
                                ? "var(--rust)"
                                : "var(--green)",
                          }}
                        >
                          {money(d.variance)}
                        </td>
                        <td className="num">
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setExpanded(open ? null : d.date)}
                          >
                            {open ? "hide" : "shifts"}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={9} style={{ background: "#fbfaf6" }}>
                            <div className="row" style={{ gap: 28, alignItems: "flex-start" }}>
                              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                                <h3 style={{ marginBottom: 6 }}>Shifts</h3>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Shift</th>
                                      <th className="num">Litres</th>
                                      <th className="num">Sales</th>
                                      <th className="num">Variance</th>
                                      <th>Closed by</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.shifts.map(({ shift, totals }) => (
                                      <tr key={shift.id}>
                                        <td>
                                          <span
                                            className="row"
                                            style={{ gap: 6, alignItems: "center" }}
                                          >
                                            <StatusDot
                                              tone={
                                                varianceTone(totals.variance) === "neg"
                                                  ? "rust"
                                                  : "green"
                                              }
                                              title={varianceLabel(totals.variance)}
                                            />
                                            {shift.name}
                                          </span>
                                        </td>
                                        <td className="num mono">{money(totals.totalLitres)}</td>
                                        <td className="num mono">{money(totals.grossSales)}</td>
                                        <td className="num mono">{money(totals.variance)}</td>
                                        <td className="small">
                                          {shift.closedByName || "—"}
                                          <div className="muted" style={{ fontSize: 11.5 }}>
                                            {formatStamp(shift.closedAt)}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              <div style={{ flex: "0 1 300px", minWidth: 260 }}>
                                <h3 style={{ marginBottom: 6 }}>By fuel</h3>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Fuel</th>
                                      <th className="num">Litres</th>
                                      <th className="num">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Object.entries(d.fuels).map(([fuel, v]) => (
                                      <tr key={fuel}>
                                        <td>{fuel}</td>
                                        <td className="num mono">{money(v.litres)}</td>
                                        <td className="num mono">{money(v.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr>
                                      <td>Total</td>
                                      <td className="num mono">{money(d.litres)}</td>
                                      <td className="num mono">{money(d.sales)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
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
