import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import Money from "../../components/Money.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon, PlusIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, money, todayISO } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { defaultRange, filterByRange, shiftStatementReport } from "../../lib/export.js";
import { StatusTag } from "./parts.jsx";
import ExpensesSheet from "./ExpensesSheet.jsx";
import { shiftPaths } from "./paths.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The shifts list for managers and owners: open shifts as live cards at the
 * top, everything handed in below as compact rows that tap through to the
 * full breakdown. The station choice is a header filter, not a panel, and it
 * follows the viewer between shifts, stock, ledger and credit.
 */
export default function ShiftsList() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const {
    stations,
    station,
    stationId,
    setStation,
    link,
    loading: stationsLoading,
  } = useStation();
  const paths = shiftPaths(profile.role);

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseFor, setExpenseFor] = useState(null);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      setShifts(await listShifts(stationId));
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

  const open = shifts.filter((s) => s.status === SHIFT_STATUS.OPEN);
  const settled = shifts.filter((s) => s.status !== SHIFT_STATUS.OPEN);
  const awaiting = settled.filter((s) => s.status !== SHIFT_STATUS.APPROVED);

  const todayLine = useMemo(() => {
    const todays = settled.filter((s) => s.date === todayISO());
    if (todays.length === 0) return null;
    const totals = todays.map(shiftTotals);
    const litres = totals.reduce((sum, x) => sum + x.totalLitres, 0);
    const gross = totals.reduce((sum, x) => sum + x.gross, 0);
    return `${t("shifts.todaySoFar")} · ${money(litres)} L · ₹ ${money(gross)}`;
  }, [settled, t]);

  const buildReport = useCallback(
    (range, filters = {}) =>
      shiftStatementReport({
        shifts: filterByRange(settled, range),
        stationName: station?.name || "",
        ...filters,
      }),
    [settled, station]
  );
  const statement = useMemo(
    () =>
      shiftStatementReport({
        shifts: filterByRange(settled, defaultRange()),
        stationName: station?.name || "",
      }),
    [settled, station]
  );
  const statementCore = new Set([0, 1, 4, 7, 13, 21]);

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("shifts.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("shifts.title")}
        sub={[station?.name, todayLine].filter(Boolean).join(" · ")}
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
        actions={
          <>
            <ReportSheet
              report="shifts"
              title="Daily Sales Statement"
              stationName={station?.name || ""}
              buildReport={buildReport}
            />
            <button
              type="button"
              className="tool-btn tool-btn--primary"
              onClick={() => navigate(paths.start)}
            >
              <PlusIcon size={16} />
              {t("shifts.startShift")}
            </button>
          </>
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : (
          <>
            {open.length > 0 && (
              <section className="stack" style={{ gap: 10 }}>
                <div className="section-label">
                  <h2>{t("shifts.openShifts")}</h2>
                  <span className="live-pill">
                    <span className="live-dot" aria-hidden="true" />
                    {t("shifts.openCount", { count: open.length })}
                  </span>
                </div>
                {open.map((shift) => (
                  <div key={shift.id} className="open-card">
                    <div className="open-card__head">
                      <div>
                        <div className="open-card__name">{shift.employeeName}</div>
                        <div className="small muted">
                          {t("shifts.started")} {formatStamp(shift.startTime)} ·{" "}
                          {tn(shift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}
                        </div>
                      </div>
                      <span className="open-card__nozzles">
                        {shift.nozzles.map((nozzle) => (
                          <span
                            key={nozzle.nozzleId}
                            className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                            title={nozzle.label}
                          />
                        ))}
                      </span>
                    </div>
                    <div className="open-card__actions">
                      <button
                        type="button"
                        className="small"
                        onClick={() => setExpenseFor(shift)}
                      >
                        {t("shifts.addExpense")}
                      </button>
                      <Link
                        className="small primary-link"
                        to={link(paths.close(shift.id))}
                      >
                        {t("shifts.closeShift")}
                      </Link>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {profile.role === "owner" && statement.rows.length > 0 && (
              <section className="stack" style={{ gap: 10 }}>
                <div className="section-label">
                  <h2>{t("shifts.statement")}</h2>
                  <span className="small muted">{t("shifts.monthToDate")}</span>
                </div>
                <div className="statement-table-wrap">
                  <table className="responsive-table statement-table">
                    <thead>
                      <tr>
                        {statement.columns.map((column, index) => (
                          <th
                            key={column}
                            className={statementCore.has(index) ? "statement-core" : ""}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {statement.rows.map((row, rowIndex) => (
                        <tr
                          key={`${row[0]}-${row[1]}-${rowIndex}`}
                          className={
                            row[1] === "Day total" || row[1] === "GRAND TOTAL"
                              ? "statement-total"
                              : ""
                          }
                        >
                          {row.map((cell, index) => (
                            <td
                              key={index}
                              data-label={statement.columns[index]}
                              className={statementCore.has(index) ? "statement-core" : ""}
                            >
                              <span>{cell}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="stack" style={{ gap: 10 }}>
              <div className="section-label">
                <h2>{t("shifts.closedShifts")}</h2>
                <span className="small muted">
                  {awaiting.length
                    ? t("shifts.awaiting", { count: awaiting.length })
                    : t("shifts.allSignedOff")}
                </span>
              </div>
              {settled.length === 0 ? (
                <div className="empty-card">
                  <h2>{t("shifts.noneClosed")}</h2>
                </div>
              ) : (
                <div className="list-stack">
                  {settled.map((shift) => {
                    const totals = shiftTotals(shift);
                    return (
                      <Link
                        key={shift.id}
                        to={link(paths.detail(shift.id))}
                        className="list-card"
                      >
                        <div className="list-card__row">
                          <span className="list-card__title">
                            {shift.employeeName}
                            <span className="list-card__date mono small">
                              {formatDate(shift.date)}
                            </span>
                          </span>
                          <StatusTag
                            status={shift.status}
                            reopened={Boolean(shift.approvedAt)}
                          />
                        </div>
                        <div className="list-card__row list-card__row--figures">
                          <span className="list-card__figure">
                            <span className="k">{t("shifts.litres")}</span>
                            <span className="v mono">{money(totals.totalLitres)} L</span>
                          </span>
                          <span className="list-card__figure">
                            <span className="k">{t("shifts.net")}</span>
                            <span className="v">
                              <Money
                                kind="neutral"
                                value={totals.net}
                                label={t("shifts.net")}
                              />
                            </span>
                          </span>
                          <span className="list-card__figure">
                            <span className="k">{t("shifts.variance")}</span>
                            <span className="v">
                              <Money
                                kind="variance"
                                value={totals.variance}
                                label={t("shifts.variance")}
                              />
                            </span>
                          </span>
                          <span className="list-card__chev">
                            <ChevronIcon size={17} />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <ExpensesSheet
        open={!!expenseFor}
        onClose={() => setExpenseFor(null)}
        shift={expenseFor}
        stationId={stationId}
        onChange={load}
      />
    </>
  );
}
