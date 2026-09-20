import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import StationIdentity from "../../components/StationIdentity.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import {
  ChevronIcon,
  HistoryIcon,
  PumpIcon,
  ShiftIcon,
} from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listNozzleOccupancy, listPumps, listShifts, readableError } from "../../lib/api";
import { currency, formatStamp, litres, todayISO } from "../../lib/format";
import {
  SHIFT_STATUS,
  anonymousNozzleOccupancy,
  nozzleOccupancy,
  shiftTotals,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import ExpensesSheet from "../shifts/ExpensesSheet.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** The attendant's merchant-first snapshot, backed only by their real shift data. */
export default function TodayHome() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { station, stationId, loading: stationsLoading } = useStation();

  const [shifts, setShifts] = useState([]);
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [busyIds, setBusyIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseFor, setExpenseFor] = useState(null);

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
            <section className="sales-hero" aria-labelledby="today-sales-title">
              <div className="sales-hero__eyebrow" id="today-sales-title">
                {t("today.sales")}
              </div>
              {settledToday.length > 0 ? (
                <>
                  <div className="sales-hero__amount mono">
                    {currency(todayTotals.gross)}
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

            <section className="dashboard-section" aria-labelledby="quick-actions-title">
              <div className="section-label">
                <h2 id="quick-actions-title">{t("today.quickActions")}</h2>
              </div>
              <div className="quick-actions">
                {!myShift && (
                  <button
                    type="button"
                    className="quick-action quick-action--primary"
                    disabled={!canStart}
                    onClick={() => navigate("/today/start")}
                  >
                    <span className="quick-action__icon">
                      <ShiftIcon size={19} />
                    </span>
                    <span>{t("shifts.startShift")}</span>
                    <ChevronIcon size={15} />
                  </button>
                )}
                <Link to="/today/history" className="quick-action">
                  <span className="quick-action__icon">
                    <HistoryIcon size={19} />
                  </span>
                  <span>{t("nav.history")}</span>
                  <ChevronIcon size={15} />
                </Link>
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="shift-status-title">
              <div className="section-label">
                <h2 id="shift-status-title">{t("nav.shift")}</h2>
              </div>
              {myShift ? (
                <Link
                  to={`/today/shift/${myShift.id}`}
                  className="status-card status-card--live"
                >
                  <div className="status-card__top">
                    <span className="live-pill">
                      <span className="live-dot" aria-hidden="true" />
                      {t("today.shiftRunning")}
                    </span>
                    <ChevronIcon size={18} />
                  </div>
                  <div className="status-card__operator">
                    <strong>{profile.name}</strong>
                    <span>
                      {t("shifts.started")} {formatStamp(myShift.startTime)}
                    </span>
                  </div>
                  <div className="status-card__figures">
                    <div className="status-card__figure">
                      <span className="k">{t("today.expensesSoFar")}</span>
                      <span className="v mono">{currency(expensesSoFar)}</span>
                    </div>
                    <div className="status-card__figure">
                      <span className="k">{t("shifts.nozzlesLabel")}</span>
                      <span className="v mono">{myShift.nozzles.length}</span>
                    </div>
                  </div>
                  <div className="status-card__foot">
                    <span className="status-card__nozzles">
                      {myShift.nozzles.map((nozzle) => (
                        <span
                          key={nozzle.nozzleId}
                          className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                          title={nozzle.label}
                        />
                      ))}
                      {tn(myShift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}
                    </span>
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
                  <button
                    type="button"
                    className="shift-empty__action"
                    disabled={!canStart}
                    onClick={() => navigate("/today/start")}
                  >
                    {t("shifts.startShift")} <ChevronIcon size={15} />
                  </button>
                </div>
              )}
            </section>

            {myShift && (
              <ActionBar>
                <button type="button" onClick={() => setExpenseFor(myShift)}>
                  {t("shifts.addExpense")}
                </button>
                <button
                  type="button"
                  className="cta"
                  onClick={() => navigate(`/today/shift/${myShift.id}/close`)}
                >
                  {t("shifts.closeShift")}
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
