import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { LedgerIcon, StatusDot } from "../components/icons";
import { useStations } from "../state/useStations";
import { listShifts, readableError } from "../lib/api";
import { formatDate, formatStamp, money, num } from "../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceLabel, varianceTone } from "../lib/shiftMath";
import { LoadingPanels } from "../components/motion.jsx";
import ReportTools from "../components/ReportTools.jsx";
import { defaultRange, filterByRange, ledgerReport } from "../lib/export.js";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The daily ledger is now entirely DERIVED from closed shifts — there is no
 * manual sales entry anywhere. Each day rolls up its shifts; expanding a day
 * shows the individual shifts that made it.
 */
export default function DailyLedger() {
  const { t, tn } = useLanguage();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();
  const [stationId, setStationId] = useState("");
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  // The report window. The table below and every export read from this one
  // piece of state, so a download always matches what is on screen.
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
      // Everything handed in, whatever its review state.
      setShifts(
        (await listShifts(stationId)).filter((s) => s.status !== SHIFT_STATUS.OPEN)
      );
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
      d.sales += t.gross;
      d.credit += num(t.payments?.credit);
      d.digital += num(t.payments?.upi) + num(t.payments?.card);
      d.expenses += t.expensesTotal;
      d.expected += t.net;
      d.declared += t.declared ?? 0;
      d.variance += t.variance ?? 0;
      Object.entries(t.fuels).forEach(([fuel, v]) => {
        d.fuels[fuel] ||= { litres: 0, amount: 0 };
        d.fuels[fuel].litres += v.litres;
        d.fuels[fuel].amount += v.revenue;
      });
      byDate.set(s.date, d);
    });
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [shifts]);

  // Everything below the range control — table, month strip, and both
  // exports — works off this filtered list.
  const visibleDays = useMemo(() => filterByRange(days, range), [days, range]);

  const rangeTotals = useMemo(
    () => ({
      days: visibleDays.length,
      litres: visibleDays.reduce((n, d) => n + d.litres, 0),
      sales: visibleDays.reduce((n, d) => n + d.sales, 0),
      credit: visibleDays.reduce((n, d) => n + d.credit, 0),
      variance: visibleDays.reduce((n, d) => n + d.variance, 0),
    }),
    [visibleDays]
  );

  const station = stations.find((s) => s.id === stationId);

  if (stationsLoading) {
    return (
      <>
        <PageHeader title={t("ledger.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("ledger.title")}
        sub={station ? `${station.name} · ${t("ledger.subtitle")}` : ""}
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title={t("common.station")}>
            <StationPicker
              stations={stations}
              value={stationId}
              onChange={(id) => setParams({ station: id })}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        <Panel title={t("report.title")} note={t("report.note")} actions={null}>
          <ReportTools
            report="ledger"
            title="Daily ledger"
            stationName={station?.name || ""}
            range={range}
            onRangeChange={setRange}
            rowCount={visibleDays.length}
            buildReport={() =>
              ledgerReport({ days: visibleDays, stationName: station?.name || "" })
            }
          />
        </Panel>

        <Panel title={tn(rangeTotals.days, "ledger.day", "ledger.days")}>
          <div className="row" style={{ gap: 40 }}>
            <Stat label={t("ledger.litresSold")} value={money(rangeTotals.litres)} />
            <Stat label={t("ledger.fuelSales")} value={`₹ ${money(rangeTotals.sales)}`} />
            <Stat label={t("ledger.onCredit")} value={`₹ ${money(rangeTotals.credit)}`} />
            <Stat
              label={t("ledger.cashVariance")}
              value={`₹ ${money(rangeTotals.variance)}`}
              tone={varianceTone(rangeTotals.variance)}
            />
          </div>
        </Panel>

        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <LedgerIcon /> {t("ledger.dayRegister")}
            </span>
          }
          note={t("ledger.derivedNote")}
          flush
        >
          {loading ? (
            <LoadingPanels count={2} lines={4} label={t("common.loading")} />
          ) : visibleDays.length === 0 ? (
            <Empty>
              {days.length === 0 ? t("ledger.empty") : t("ledger.emptyRange")}
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th className="num">{t("ledger.shifts")}</th>
                  <th className="num">{t("shifts.litres")}</th>
                  <th className="num">{t("ledger.fuelSales")}</th>
                  <th className="num">{t("ledger.credit")}</th>
                  <th className="num">{t("ledger.expenses")}</th>
                  <th className="num">{t("ledger.collected")}</th>
                  <th className="num">{t("ledger.variance")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleDays.map((d) => {
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
                            {open ? t("common.hide") : t("ledger.shifts")}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={9} style={{ background: "var(--surface-sunken)" }}>
                            <div
                              className="row"
                              style={{ gap: 28, alignItems: "flex-start" }}
                            >
                              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                                <h3 style={{ marginBottom: 6 }}>{t("ledger.shifts")}</h3>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>{t("owner.shiftCol")}</th>
                                      <th className="num">{t("shifts.litres")}</th>
                                      <th className="num">{t("ledger.fuelSales")}</th>
                                      <th className="num">{t("ledger.variance")}</th>
                                      <th>{t("ledger.closedBy")}</th>
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
                                            {shift.employeeName}
                                          </span>
                                        </td>
                                        <td className="num mono">
                                          {money(totals.totalLitres)}
                                        </td>
                                        <td className="num mono">
                                          {money(totals.gross)}
                                        </td>
                                        <td className="num mono">
                                          {money(totals.variance)}
                                        </td>
                                        <td className="small">
                                          {shift.employeeName ||
                                            shift.closedByName ||
                                            "—"}
                                          <div
                                            className="muted"
                                            style={{ fontSize: 11.5 }}
                                          >
                                            {formatStamp(shift.endTime)}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              <div style={{ flex: "0 1 300px", minWidth: 260 }}>
                                <h3 style={{ marginBottom: 6 }}>{t("ledger.byFuel")}</h3>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>{t("ledger.fuel")}</th>
                                      <th className="num">{t("shifts.litres")}</th>
                                      <th className="num">{t("common.amount")}</th>
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
                                      <td>{t("common.total")}</td>
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
