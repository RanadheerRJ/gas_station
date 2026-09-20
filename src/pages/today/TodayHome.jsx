import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon, PumpIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listNozzleOccupancy, listPumps, listShifts, readableError } from "../../lib/api";
import { formatStamp, money, todayISO } from "../../lib/format";
import {
  SHIFT_STATUS,
  anonymousNozzleOccupancy,
  nozzleOccupancy,
  shiftTotals,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import ExpensesSheet from "../shifts/ExpensesSheet.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The attendant's home: a status card, not a dashboard.
 *
 * No shift running → one clear card and one unmistakable action. Shift
 * running → the figures that matter while you work, and the two things you
 * might need to do next, pinned where the thumb already is. Everything else
 * — picking nozzles, entering readings, reviewing history — is its own
 * screen, reached from here.
 */
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
      // An attendant is only entitled to their own shifts plus anonymous
      // nozzle availability — the customer directory and co-workers' shifts
      // are never requested, so the screen asks for exactly what it shows.
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

  const open = shifts.filter((s) => s.status === SHIFT_STATUS.OPEN);
  const myShift = open.find((s) => s.userId === profile.uid);

  // Availability comes from the anonymous RPC; when the RPC is not deployed
  // yet, fall back to the shifts this account can see rather than claiming
  // every nozzle is free.
  const nozzleBusy = useMemo(
    () => (busyIds ? anonymousNozzleOccupancy(busyIds) : nozzleOccupancy(open)),
    [busyIds, open]
  );
  const freeNozzleCount = nozzles.filter((n) => !nozzleBusy[n.id]).length;

  // "Today so far" — the station's day, not just this shift.
  const settledToday = shifts.filter(
    (s) => s.status !== SHIFT_STATUS.OPEN && s.date === todayISO()
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
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title={t("today.title")} sub={station ? station.name : ""} />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        ) : myShift ? (
          <>
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

              <div className="status-card__figures">
                <div className="status-card__figure">
                  <span className="k">{t("today.expensesSoFar")}</span>
                  <span className="v mono">₹ {money(expensesSoFar)}</span>
                </div>
                {settledToday.length > 0 && (
                  <>
                    <div className="status-card__figure">
                      <span className="k">
                        {t("shifts.litres")} · {t("shifts.todaySoFar")}
                      </span>
                      <span className="v mono">{money(todayTotals.litres)} L</span>
                    </div>
                    <div className="status-card__figure">
                      <span className="k">
                        {t("shifts.gross")} · {t("shifts.todaySoFar")}
                      </span>
                      <span className="v mono">₹ {money(todayTotals.gross)}</span>
                    </div>
                  </>
                )}
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
                <span className="small muted">
                  {t("shifts.started")} {formatStamp(myShift.startTime)} ·{" "}
                  {t("today.viewShift")}
                </span>
              </div>
            </Link>

            {/* The two actions you might need mid-shift, pinned where the
                thumb already is — the checkout-bar pattern. */}
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
          </>
        ) : (
          <>
            <div className="empty-card">
              <div className="empty-card__icon">
                <PumpIcon size={26} />
              </div>
              <h2>{t("today.noShift")}</h2>
              <p className="small muted">
                {pumps.length === 0
                  ? t("shifts.noPumps")
                  : freeNozzleCount > 0
                    ? tn(freeNozzleCount, "today.freeNozzleOne", "today.freeNozzles")
                    : t("today.allBusy")}
              </p>
            </div>

            <ActionBar>
              <button
                type="button"
                className="cta"
                disabled={pumps.length === 0 || freeNozzleCount === 0}
                onClick={() => navigate("/today/start")}
              >
                {t("shifts.startShift")}
              </button>
            </ActionBar>
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
