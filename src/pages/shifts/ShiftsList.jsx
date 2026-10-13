import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon, PlusIcon, ShiftIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useNow } from "../../state/useNow.js";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { elapsedLabel } from "../../lib/elapsed.js";
import { money, todayISO } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { defaultRange, filterByRange, shiftStatementReport } from "../../lib/export.js";
import AddNozzlesSheet from "./AddNozzlesSheet.jsx";
import ExpensesSheet from "./ExpensesSheet.jsx";
import { LiveShiftCard, ShiftCard, nozzleGroups } from "./ShiftCards.jsx";
import ShiftTabs, {
  SHIFT_TAB,
  bucketCounts,
  filterShifts,
  shiftBucket,
  shiftTabDefs,
} from "./ShiftTabs.jsx";
import { shiftPaths } from "./paths.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

export { nozzleGroups };

const STATEMENT_CORE_COLUMNS = new Set([0, 1, 4, 7, 13, 21]);

function shiftElapsed(shift, now, translate) {
  const raw = shift?.startTime;
  const started = raw?.toDate ? raw.toDate() : new Date(raw);
  const ms = started?.getTime?.();
  if (!Number.isFinite(ms)) return "";
  return elapsedLabel(now - ms, translate);
}

function emptyCopy(tab, t) {
  if (tab === SHIFT_TAB.LIVE) {
    return {
      title: t("shifts.emptyLiveTitle"),
      body: t("shifts.emptyLiveBody"),
    };
  }
  if (tab === SHIFT_TAB.REVIEW) {
    return {
      title: t("shifts.emptyReviewTitle"),
      body: t("shifts.emptyReviewBody"),
    };
  }
  return {
    title: t("shifts.noneClosed"),
    body: t("shifts.emptyClosedBody"),
  };
}

/**
 * The shifts list for managers and owners.
 *
 * Four shelves — All, Live, Review, Closed — keep what is running, what is
 * waiting on a sign-off, and what is already locked out of each other's way,
 * with the count on each tab so the queue is visible before it is opened.
 */
export default function ShiftsList() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
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
  const [tab, setTab] = useState(SHIFT_TAB.ALL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseFor, setExpenseFor] = useState(null);
  const [nozzlesFor, setNozzlesFor] = useState(null);
  const [showStatement, setShowStatement] = useState(false);

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

  const settled = useMemo(
    () => shifts.filter((s) => s.status !== SHIFT_STATUS.OPEN),
    [shifts]
  );
  const counts = useMemo(() => bucketCounts(shifts), [shifts]);
  const tabs = useMemo(() => shiftTabDefs(t, counts), [t, counts]);
  const visible = useMemo(() => filterShifts(shifts, tab), [shifts, tab]);

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
  const statementShifts = useMemo(
    () => filterByRange(settled, defaultRange()),
    [settled]
  );
  const statementAvailable = profile.role === "owner" && statementShifts.length > 0;
  const statement = useMemo(
    () =>
      showStatement
        ? shiftStatementReport({
            shifts: statementShifts,
            stationName: station?.name || "",
          })
        : null,
    [showStatement, statementShifts, station?.name]
  );

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

  const empty = emptyCopy(tab, t);

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
            <ShiftTabs
              tabs={tabs}
              value={tab}
              onChange={setTab}
              label={t("shifts.title")}
            />

            {visible.length === 0 ? (
              <div className="empty-card empty-card--compact">
                <div className="empty-card__icon" aria-hidden="true">
                  <ShiftIcon size={26} />
                </div>
                <h2>{empty.title}</h2>
                <p className="small muted">{empty.body}</p>
              </div>
            ) : (
              <div className="shift-feed">
                {visible.map((shift) => {
                  if (shiftBucket(shift) === SHIFT_TAB.LIVE) {
                    return (
                      <div key={shift.id} className="row-enter">
                        <LiveShiftCard
                          shift={shift}
                          closeHref={link(paths.close(shift.id))}
                          onAddExpense={setExpenseFor}
                          onAddNozzle={setNozzlesFor}
                          elapsed={shiftElapsed(shift, now, t)}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={shift.id} className="row-enter">
                      <ShiftCard shift={shift} to={link(paths.detail(shift.id))} />
                    </div>
                  );
                })}
              </div>
            )}

            {statementAvailable && (
              <section className="statement-preview stack" style={{ gap: 10 }}>
                <div className="section-label statement-preview__head">
                  <div className="statement-preview__title">
                    <h2>{t("shifts.statement")}</h2>
                    <span className="small muted">{t("shifts.monthToDate")}</span>
                  </div>
                  <button
                    type="button"
                    className="quiet small statement-preview__toggle"
                    aria-expanded={showStatement}
                    aria-controls="shift-statement-table"
                    onClick={() => setShowStatement((value) => !value)}
                  >
                    <ChevronIcon size={14} />
                    {showStatement
                      ? t("shifts.hideStatement")
                      : t("shifts.showStatement")}
                  </button>
                </div>
                {showStatement && statement?.rows.length > 0 && (
                  <div className="statement-table-wrap" id="shift-statement-table">
                    <table className="responsive-table statement-table">
                      <thead>
                        <tr>
                          {statement.columns.map((column, index) => (
                            <th
                              key={column}
                              className={
                                STATEMENT_CORE_COLUMNS.has(index) ? "statement-core" : ""
                              }
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
                                className={
                                  STATEMENT_CORE_COLUMNS.has(index)
                                    ? "statement-core"
                                    : ""
                                }
                              >
                                <span>{cell}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
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

      <AddNozzlesSheet
        open={!!nozzlesFor}
        onClose={() => setNozzlesFor(null)}
        shift={nozzlesFor}
        stationId={stationId}
        onChange={load}
      />
    </>
  );
}
