import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import Money from "../../components/Money.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { Card } from "../../components/Card.jsx";
import { Chip, ChipRow } from "../../components/Chip.jsx";
import ListRow from "../../components/ListRow.jsx";
import StickyCta from "../../components/StickyCta.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { useNow } from "../../state/useNow.js";
import { elapsedLabel } from "../../lib/elapsed.js";
import { useLanguage } from "../../state/LanguageContext.jsx";
import {
  CheckIcon,
  HistoryIcon,
  PlusIcon,
  PumpIcon,
  RefreshIcon,
  ShiftIcon,
} from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listNozzleOccupancy, listPumps, listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, litres, money, todayISO } from "../../lib/format";
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

function greetingKey(hour) {
  if (hour < 12) return "today.goodMorning";
  if (hour < 17) return "today.goodAfternoon";
  return "today.goodEvening";
}

/**
 * The attendant's home feed, drawn like a delivery app's: a greeting that
 * says where you are and what is live, one hero card tinted by the state of
 * your shift, a scrolling row of today's numbers, the free nozzles as fuel
 * chips, and your latest shifts as rows. The one primary action — start, or
 * continue — is always the same pinned pill above the tab bar.
 *
 * Backed only by the attendant's own shift data (RLS sees to it) plus the
 * anonymous busy-nozzle list; every figure shown already exists. A running
 * shift's litres and sales are deliberately not guessed here: the close
 * screen enters closing readings, so "so far" would be invented numbers.
 * The hero shows what is honestly live — elapsed time, expenses, nozzles.
 */
export default function TodayHome() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { station, stationId, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);
  const now = useNow(30_000);

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
  // Free nozzles grouped by fuel, as tappable chips: picking a fuel goes
  // straight into the picker with that fuel preselected.
  const freeByFuel = useMemo(() => {
    const groups = new Map();
    nozzles.forEach((nozzle) => {
      if (nozzleBusy[nozzle.id]) return;
      const key = nozzle.fuelType || "MS";
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    return [...groups.entries()];
  }, [nozzles, nozzleBusy]);

  const elapsedMs = myShift
    ? Math.max(0, now - new Date(myShift.startTime).getTime())
    : 0;
  const greeting = `${t(greetingKey(new Date().getHours()))}, ${profile.name}`;
  const canStart = pumps.length > 0 && freeNozzleCount > 0;

  const statusChip = sentBack ? (
    <Chip label={t("shifts.sentBack")} tone="credit" />
  ) : myShift ? (
    <Chip label={t("today.shiftRunning")} tone="ok" />
  ) : (
    <Chip label={t("today.noShift")} />
  );

  return (
    <>
      <ScreenHeader
        title={greeting}
        sub={
          station?.name
            ? `${station.name} · ${formatDate(todayISO())}`
            : formatDate(todayISO())
        }
        actions={
          <>
            {statusChip}
            <button
              type="button"
              className="tool-btn"
              onClick={load}
              aria-label={t("common.refresh")}
              disabled={loading}
            >
              <RefreshIcon size={16} />
            </button>
          </>
        }
      />
      <div className="content today-dashboard">
        {error && (
          <Notice kind="error">
            {error}{" "}
            <button type="button" className="quiet notice__action" onClick={load}>
              {t("common.retry")}
            </button>
          </Notice>
        )}

        {loading || stationsLoading ? (
          <Skeleton shape="card" count={3} />
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

            {/* The hero card: tinted by the state of the shift, one big live
                figure, and the whole card continues into the shift. */}
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
                    <span className="status-card__elapsed">
                      <span className="figure-hero">{elapsedLabel(elapsedMs, t)}</span>
                    </span>
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

            {/* Today's numbers as a scrolling row of stat cards. */}
            <section className="dashboard-section" aria-labelledby="today-numbers-title">
              <div className="section-label">
                <h2 id="today-numbers-title">{t("today.sales")}</h2>
              </div>
              <div className="quick-stat-row">
                <Card className="quick-stat">
                  <Stat
                    label={t("today.sales")}
                    amount={todayTotals.gross}
                    format={money}
                    prefix="₹ "
                  />
                </Card>
                <Card className="quick-stat">
                  <Stat
                    label={t("today.fuelDispensed")}
                    amount={todayTotals.litres}
                    format={(n) => `${litres(n)} L`}
                  />
                </Card>
                <Card className="quick-stat">
                  <Stat
                    label={t("today.expensesSoFar")}
                    amount={expensesSoFar}
                    format={money}
                    prefix="₹ "
                    tone={expensesSoFar > 0 ? "neg" : ""}
                  />
                </Card>
              </div>
            </section>

            {/* Free nozzles by fuel: a chip starts the picker on that fuel. */}
            {freeByFuel.length > 0 && !myShift && (
              <section className="dashboard-section" aria-labelledby="free-nozzles-title">
                <div className="section-label">
                  <h2 id="free-nozzles-title">{t("today.availableNozzles")}</h2>
                </div>
                <ChipRow label={t("today.availableNozzles")}>
                  {freeByFuel.map(([fuel, count]) => (
                    <Chip
                      key={fuel}
                      label={fuel}
                      count={count}
                      onClick={() =>
                        navigate(`${paths.start}?fuel=${encodeURIComponent(fuel)}`)
                      }
                    />
                  ))}
                </ChipRow>
              </section>
            )}

            <section className="dashboard-section" aria-labelledby="recent-shifts-title">
              <div className="section-label">
                <h2 id="recent-shifts-title">{t("today.recentShifts")}</h2>
                <Link to={paths.list} className="see-all">
                  {t("today.seeAll")}
                </Link>
              </div>
              {recent.length > 0 ? (
                <div className="stack">
                  {recent.map((shift) => {
                    const totals = shiftTotals(shift);
                    return (
                      <ListRow
                        key={shift.id}
                        icon={ShiftIcon}
                        title={formatDate(shift.date)}
                        subtitle={`${t("shifts.started")} ${formatStamp(shift.startTime)} · ${litres(totals.totalLitres)} L`}
                        trailing={
                          <>
                            <StatusTag status={shift.status} />
                            <Money
                              kind="neutral"
                              value={totals.net}
                              label={`${formatDate(shift.date)} · ${t("shifts.net")}`}
                            />
                          </>
                        }
                        to={paths.detail(shift.id)}
                      />
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <EmptyState
                    icon={HistoryIcon}
                    headline={t("today.noHistoryTitle")}
                    body={t("today.noHistoryBody")}
                  />
                </Card>
              )}
            </section>

            {myShift ? (
              <StickyCta
                summary={`${t("today.shiftRunning")} · ${elapsedLabel(elapsedMs, t)}`}
                ctaLabel={t("today.continueShift")}
                onCta={() => navigate(paths.run(myShift.id))}
                secondary={
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() => setExpenseFor(myShift)}
                  >
                    <PlusIcon size={16} />
                    {t("shifts.addExpense")}
                  </button>
                }
              />
            ) : (
              <StickyCta
                summary={
                  pumps.length === 0
                    ? t("shifts.noPumps")
                    : freeNozzleCount > 0
                      ? tn(freeNozzleCount, "today.freeNozzleOne", "today.freeNozzles")
                      : t("today.allBusy")
                }
                ctaLabel={t("shifts.startShift")}
                onCta={() => navigate(paths.start)}
                disabled={!canStart}
              />
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
