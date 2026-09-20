import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Empty, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, money } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import ExpensesSheet from "../shifts/ExpensesSheet.jsx";
import { SettledShiftDetail } from "../shifts/ShiftDetail.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The running shift, on its own screen: what you took, what it read when you
 * took it, and the drawer's expenses so far. Adding an expense is a sheet;
 * closing is the pinned action. Nothing else competes for the space.
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
        <ScreenHeader title={t("today.yourShift")} back={{ to: "/today" }} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ScreenHeader title={t("today.yourShift")} back={{ to: "/today" }} />
        <div className="content">
          <Notice kind="error">{error}</Notice>
        </div>
      </>
    );
  }

  if (!shift) {
    return (
      <>
        <ScreenHeader title={t("today.yourShift")} back={{ to: "/today" }} />
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
          back={{ to: "/today/history" }}
        />
        <div className="content stack">
          <SettledShiftDetail shift={shift} customers={[]} canReview={false} />
        </div>
      </>
    );
  }

  const totals = shiftTotals(shift);

  return (
    <>
      <ScreenHeader
        title={t("today.yourShift")}
        sub={`${t("shifts.started")} ${formatStamp(shift.startTime)}${
          station ? ` · ${station.name}` : ""
        }`}
        back={{ to: "/today" }}
      />
      <div className="content stack">
        {/* What you took, and the meter you started from. */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{tn(shift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}</h2>
            <span className="small muted">{t("shifts.meterReadings")}</span>
          </div>
          <div>
            {shift.nozzles.map((nozzle) => (
              <div key={nozzle.nozzleId} className="reading-row">
                <span className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`} />
                <span className="reading-row__label">{nozzle.label}</span>
                <span className="muted small">{nozzle.fuelType}</span>
                <span className="reading-row__value mono">
                  {money(nozzle.openingReading)}
                </span>
                <span className="reading-row__price mono muted">
                  ₹ {money(nozzle.price)}/L
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* The drawer's story, written as it happens. */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.drawerExpenses")}</h2>
            <span className="mono" style={{ fontWeight: 650 }}>
              ₹ {money(totals.expensesTotal)}
            </span>
          </div>
          <div>
            {(shift.expenses || []).length === 0 ? (
              <Empty>{t("common.none")}</Empty>
            ) : (
              (shift.expenses || []).map((expense, index) => (
                <div key={index} className="reading-row">
                  <span className="reading-row__label">{expense.label}</span>
                  <span className="reading-row__value mono">
                    ₹ {money(expense.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <ActionBar>
          <button type="button" onClick={() => setExpenseOpen(true)}>
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
