import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import Money from "../../components/Money.jsx";
import { ActionBar, Empty, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { PlusIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, money } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import ExpensesSheet from "../shifts/ExpensesSheet.jsx";
import { SettledShiftDetail } from "../shifts/ShiftDetail.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** A wall clock that ticks once every 30s — often enough that the elapsed
 *  figure never reads stale, rarely enough that it flickers. */
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Elapsed time in whole minutes, as "2h 15m" / "45m" in the UI language. */
function elapsedLabel(elapsedMs, translate) {
  const minutes = Math.max(0, Math.floor(elapsedMs / 60000));
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return translate("shifts.elapsedHm", { hours, minutes: minutes % 60 });
  return translate("shifts.elapsedM", { minutes });
}

/**
 * The running shift, on its own screen: how long you have been on it, what
 * you took and the meter you started from, and the drawer's expenses so far.
 * Adding an expense is a sheet; closing is the pinned action — the one
 * primary job of this screen. Nothing else competes for the space.
 *
 * A settled shift on this route (arrived via an old link) renders read-only
 * rather than pretending it can still be worked.
 */
export default function ShiftRun() {
  const { t, tn } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { station, stationId, loading: stationsLoading } = useStation();

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const now = useNow();

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

  // RLS already refuses another employee's shift; this keeps the screen
  // honest about it rather than rendering a row it cannot act on.
  const shift = shifts.find(
    (s) => s.id === id && (profile.role !== "attendant" || s.userId === profile.uid)
  );

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("today.yourShift")} back="/today" />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ScreenHeader title={t("today.yourShift")} back="/today" />
        <div className="content">
          <Notice kind="error">
            {error}{" "}
            <button type="button" className="quiet notice__action" onClick={load}>
              {t("common.retry")}
            </button>
          </Notice>
        </div>
      </>
    );
  }

  if (!shift) {
    return (
      <>
        <ScreenHeader title={t("today.yourShift")} back="/today" />
        <div className="content">
          <div className="empty-card">
            <h2>{t("shifts.notFound")}</h2>
          </div>
        </div>
      </>
    );
  }

  // Landed on a settled shift: show it read-only, history-style.
  if (shift.status !== SHIFT_STATUS.OPEN) {
    return (
      <>
        <ScreenHeader
          title={shift.employeeName}
          sub={`${formatDate(shift.date)}${station ? ` · ${station.name}` : ""}`}
          back="/today/history"
        />
        <div className="content stack">
          <SettledShiftDetail shift={shift} customers={[]} canReview={false} />
        </div>
      </>
    );
  }

  const totals = shiftTotals(shift);
  const elapsed = now - new Date(shift.startTime).getTime();

  return (
    <>
      <ScreenHeader
        title={t("today.yourShift")}
        sub={`${t("shifts.started")} ${formatStamp(shift.startTime)}${
          station ? ` · ${station.name}` : ""
        }`}
        back="/today"
      />
      <div className="content stack">
        {/* How long, and what you are holding. */}
        <section className="card run-hero" aria-labelledby="run-elapsed-title">
          <div className="run-hero__elapsed">
            <span className="k" id="run-elapsed-title">
              {t("shifts.runningFor")}
            </span>
            <strong className="v mono" data-testid="run-elapsed">
              {elapsedLabel(elapsed, t)}
            </strong>
            <span className="sub">
              {t("shifts.started")} {formatStamp(shift.startTime)}
            </span>
          </div>
          <div className="status-card__chips">
            {shift.nozzles.map((nozzle) => (
              <span key={nozzle.nozzleId} className="nozzle-chip">
                <span
                  className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                  aria-hidden="true"
                />
                {nozzle.label}
              </span>
            ))}
          </div>
        </section>

        {/* What you took, and the meter you started from. */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{tn(shift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}</h2>
            <span className="small muted">{t("shifts.meterReadings")}</span>
          </div>
          <div className="run-readings">
            {shift.nozzles.map((nozzle) => (
              <div key={nozzle.nozzleId} className="run-reading">
                <div className="run-reading__head">
                  <span
                    className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                    aria-hidden="true"
                  />
                  <strong>{nozzle.label}</strong>
                  <span className={`fuel-tag fuel-tag--${fuelClass(nozzle.fuelType)}`}>
                    {nozzle.fuelType}
                  </span>
                </div>
                <div className="run-reading__figures">
                  <div>
                    <span>{t("shifts.opening")}</span>
                    <strong className="mono">{money(nozzle.openingReading)}</strong>
                  </div>
                  <div>
                    <span>{t("shifts.price")}</span>
                    <strong className="mono">₹ {money(nozzle.price)}/L</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The drawer's story, written as it happens. */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.drawerExpenses")}</h2>
            <Money
              kind="out"
              value={totals.expensesTotal}
              label={t("shifts.drawerExpenses")}
            />
          </div>
          <div>
            {(shift.expenses || []).length === 0 ? (
              <Empty>{t("common.none")}</Empty>
            ) : (
              (shift.expenses || []).map((expense, index) => (
                <div key={index} className="reading-row">
                  <span className="reading-row__label">{expense.label}</span>
                  <span className="reading-row__value mono">
                    <Money kind="out" value={expense.amount} label={expense.label} />
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <ActionBar>
          <button
            type="button"
            className="action-bar__with-icon"
            onClick={() => setExpenseOpen(true)}
          >
            <PlusIcon size={16} />
            {t("shifts.addExpense")}
          </button>
          <button
            type="button"
            className="cta"
            onClick={() => navigate(`/today/shift/${shift.id}/close`)}
          >
            {t("shifts.closeShift")}
          </button>
        </ActionBar>
      </div>

      <ExpensesSheet
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        shift={shift}
        stationId={stationId}
        onChange={load}
      />
    </>
  );
}
