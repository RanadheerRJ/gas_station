import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import StationIdentity from "../../components/StationIdentity.jsx";
import Money from "../../components/Money.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { LanguageSelect, useLanguage } from "../../state/LanguageContext.jsx";
import {
  CheckIcon,
  ChevronIcon,
  PlusIcon,
  PumpIcon,
  ShiftIcon,
} from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listNozzleOccupancy, listPumps, listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, litres, todayISO } from "../../lib/format";
import { takeFlash } from "../../lib/flash.js";
import { scopeShiftsToViewer } from "../../lib/export.js";
import {
  SHIFT_STATUS,
  anonymousNozzleOccupancy,
  nozzleOccupancy,
  shiftTotals,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { StatusTag } from "../shifts/parts.jsx";
import { shiftPaths } from "../shifts/paths.js";
import ExpensesSheet from "../shifts/ExpensesSheet.jsx";

/**
 * The attendant's morning board, drawn for someone standing at a forecourt
 * counter with one hand free: what needs doing first (a sent-back shift), a
 * single status card that says what is running right now, today's own
 * numbers, and the latest few shifts. The one primary action is always in
 * the pinned bar — start, or continue.
 *
 * Backed only by the attendant's own shift data (RLS sees to it) plus the
 * anonymous busy-nozzle list; every figure shown already exists.
 */
export default function TodayHome() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { station, stationId, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);

  const [shifts, setShifts] = useState([]);
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [busyIds, setBusyIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseFor, setExpenseFor] = useState(null);
  // A shift was just submitted from the close screen: the flash note is read
  // exactly once, so the confirmation is shown now and never again.
  const [justSent, setJustSent] = useState(() => takeFlash("shiftSent"));

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [own, equipment, busy] = await Promise.all([
        listShifts(stationId),
        listPumps(stationId),
        listNozzleOccupancy(stationId),
      ]);
      setShifts(own);
      setPumps(equipment.pumps);
      setNozzles(equipment.nozzles);
      setBusyIds(busy);
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

  const open = shifts.filter((shift) => shift.status === SHIFT_STATUS.OPEN);
  const myShift = open.find((shift) => shift.userId === profile.uid);
  // A sent-back shift is the one thing that outranks everything else on this
  // screen: it is the owner asking for work, so it leads.
  const sentBack = shifts.find(
    (shift) =>
      shift.status === SHIFT_STATUS.REJECTED &&
      (shift.userId === profile.uid || shift.employeeId === profile.uid)
  );
  const nozzleBusy = useMemo(
    () => (busyIds ? anonymousNozzleOccupancy(busyIds) : nozzleOccupancy(open)),
    [busyIds, open]
  );
  const freeNozzleCount = nozzles.filter((nozzle) => !nozzleBusy[nozzle.id]).length;
  const settledToday = shifts.filter(
    (shift) => shift.status !== SHIFT_STATUS.OPEN && shift.date === todayISO()
  );
  const todayTotals = useMemo(
    () =>
      settledToday.reduce(
        (acc, shift) => {
          const totals = shiftTotals(shift);
          return {
            litres: acc.litres + totals.totalLitres,
            gross: acc.gross + totals.gross,
          };
        },
        { litres: 0, gross: 0 }
      ),
    [settledToday]
  );
  const expensesSoFar = myShift ? shiftTotals(myShift).expensesTotal : 0;
  // The most recent handful of the attendant's own closed shifts, newest
  // first (listShifts already orders by start time).
  const recent = useMemo(
    () =>
      scopeShiftsToViewer(shifts, profile)
        .filter((shift) => shift.status !== SHIFT_STATUS.OPEN)
        .slice(0, 3),
    [shifts, profile]
  );

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("today.title")} />
        <div className="content">
          <LoadingPanels count={2} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  const canStart = pumps.length > 0 && freeNozzleCount > 0;

  return (
    <>
      <ScreenHeader title={t("today.title")} />
      <div className="content today-dashboard">
        <StationIdentity stationName={station?.name || ""} />

        <div className="today-meta">
          <span className="today-meta__date">
            <ShiftIcon size={14} />
            {formatDate(todayISO())}
          </span>
          <LanguageSelect compact />
        </div>

        {error && (
          <Notice kind="error">
            {error}{" "}
            <button type="button" className="quiet notice__action" onClick={load}>
              {t("common.retry")}
            </button>
          </Notice>
        )}

        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : (
          <>
            {justSent && (
              <section
                className="card sent-card"
                aria-labelledby="sent-card-title"
                data-testid="sent-confirmation"
              >
                <span className="sent-card__icon" aria-hidden="true">
                  <CheckIcon size={22} />
                </span>
                <div className="sent-card__body">
                  <h2 id="sent-card-title">{t("today.sentForReview")}</h2>
                  <p className="small muted">{t("today.reviewNext")}</p>
                </div>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setJustSent(false)}
                >
                  {t("today.backToToday")}
                </button>
              </section>
            )}

            {sentBack && (
              <section className="card sentback-card" aria-labelledby="sentback-title">
                <span className="sentback-card__icon" aria-hidden="true">
                  ↩
                </span>
                <div className="sentback-card__body">
                  <h2 id="sentback-title">{t("today.sentBackTitle")}</h2>
                  <p className="sentback-card__reason">
                    {t("shifts.sentBackBy", {
                      who: sentBack.rejectedByName || t("shifts.theOwner"),
                    })}
                    {sentBack.rejectionReason ? `: ${sentBack.rejectionReason}` : ""}
                  </p>
                  <p className="small muted">{t("close.fixAndResend")}</p>
                </div>
                <Link className="sentback-card__action" to={paths.correct(sentBack.id)}>
                  {t("shifts.editAndResubmit")}
                </Link>
              </section>
            )}

            <section className="dashboard-section" aria-labelledby="shift-status-title">
              <div className="section-label">
                <h2 id="shift-status-title">{t("nav.shift")}</h2>
              </div>
              {myShift ? (
                <Link
                  to={paths.run(myShift.id)}
                  className="status-card status-card--live"
                >
                  <div className="status-card__top">
                    <span className="live-pill">
                      <span className="live-dot" aria-hidden="true" />
                      {t("today.runningSince", { time: formatStamp(myShift.startTime) })}
                    </span>
                    <ChevronIcon size={18} />
                  </div>
                  <div className="status-card__operator">
                    <strong>{profile.name}</strong>
                    <span>
                      {tn(myShift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}
                    </span>
                  </div>
                  <div className="status-card__chips">
                    {myShift.nozzles.map((nozzle) => (
                      <span key={nozzle.nozzleId} className="nozzle-chip">
                        <span
                          className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                          aria-hidden="true"
                        />
                        {nozzle.label}
                      </span>
                    ))}
                  </div>
                  <div className="status-card__figures">
                    <div className="status-card__figure">
                      <span className="k">{t("today.expensesSoFar")}</span>
                      <span className="v">
                        <Money
                          kind="out"
                          value={expensesSoFar}
                          label={t("today.expensesSoFar")}
                        />
                      </span>
                    </div>
                  </div>
                  <div className="status-card__foot">
                    <span className="primary-link">{t("today.viewShift")}</span>
                  </div>
                </Link>
              ) : (
                <div className="shift-empty">
                  <div className="shift-empty__icon">
                    <PumpIcon size={21} />
                  </div>
                  <div className="shift-empty__copy">
                    <strong>{t("today.noShift")}</strong>
                    <span>
                      {pumps.length === 0
                        ? t("shifts.noPumps")
                        : freeNozzleCount > 0
                          ? tn(
                              freeNozzleCount,
                              "today.freeNozzleOne",
                              "today.freeNozzles"
                            )
                          : t("today.allBusy")}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section className="sales-hero" aria-labelledby="today-sales-title">
              <div className="sales-hero__eyebrow" id="today-sales-title">
                {t("today.sales")}
              </div>
              {settledToday.length > 0 ? (
                <>
                  <div className="sales-hero__amount">
                    <Money
                      kind="neutral"
                      size="lg"
                      value={todayTotals.gross}
                      label={t("today.sales")}
                    />
                  </div>
                  <div className="sales-hero__support">
                    <strong className="mono">{litres(todayTotals.litres)} L</strong>
                    <span>{t("today.fuelDispensed")}</span>
                  </div>
                  <div className="sales-hero__meta">
                    {tn(
                      settledToday.length,
                      "today.closedShiftOne",
                      "today.closedShifts"
                    )}
                  </div>
                </>
              ) : (
                <div className="sales-hero__empty">
                  <span className="sales-hero__amount mono">—</span>
                  <span>{t("today.noCompletedSales")}</span>
                </div>
              )}
            </section>

            {recent.length > 0 && (
              <section
                className="dashboard-section"
                aria-labelledby="recent-shifts-title"
              >
                <div className="section-label">
                  <h2 id="recent-shifts-title">{t("today.recentShifts")}</h2>
                  <Link to={paths.list} className="see-all">
                    {t("today.seeAll")}
                    <ChevronIcon size={14} />
                  </Link>
                </div>
                <div className="history-list">
                  {recent.map((shift) => {
                    const totals = shiftTotals(shift);
                    return (
                      <Link
                        key={shift.id}
                        to={paths.detail(shift.id)}
                        className="history-card history-card--recent"
                      >
                        <div className="history-card__head">
                          <div>
                            <strong>{formatDate(shift.date)}</strong>
                            <span>
                              {t("shifts.started")} {formatStamp(shift.startTime)}
                            </span>
                          </div>
                          <StatusTag status={shift.status} />
                        </div>
                        <div className="history-card__financial">
                          <div>
                            <span>{t("shifts.net")}</span>
                            <Money
                              kind="neutral"
                              value={totals.net}
                              label={`${formatDate(shift.date)} · ${t("shifts.net")}`}
                            />
                          </div>
                          <ChevronIcon size={18} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {myShift ? (
              <ActionBar>
                <button
                  type="button"
                  className="action-bar__with-icon"
                  onClick={() => setExpenseFor(myShift)}
                >
                  <PlusIcon size={16} />
                  {t("shifts.addExpense")}
                </button>
                <button
                  type="button"
                  className="cta"
                  onClick={() => navigate(paths.run(myShift.id))}
                >
                  {t("today.continueShift")}
                </button>
              </ActionBar>
            ) : (
              <ActionBar>
                <button
                  type="button"
                  className="cta"
                  disabled={!canStart}
                  onClick={() => navigate(paths.start)}
                >
                  <ShiftIcon size={17} />
                  {t("shifts.startShift")}
                </button>
              </ActionBar>
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
    </>
  );
}
