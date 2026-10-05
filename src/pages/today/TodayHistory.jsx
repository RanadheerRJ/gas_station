import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import Money from "../../components/Money.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, litres } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { scopeShiftsToViewer, shiftsReport, filterByRange } from "../../lib/export.js";
import { StatusTag } from "../shifts/parts.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The attendant's own shifts as tappable cards: date, nozzles, where the
 * shift stands in review, and the money in the shared colour language.
 * Scoping stays exactly as it was — the viewer's own shifts only, enforced
 * again here on top of RLS.
 */
export default function TodayHistory() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const { station, stationId, loading: stationsLoading } = useStation();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const mine = useMemo(
    () =>
      scopeShiftsToViewer(shifts, profile).filter(
        (shift) => shift.status !== SHIFT_STATUS.OPEN
      ),
    [shifts, profile]
  );
  const buildReport = useCallback(
    (range) =>
      shiftsReport({
        shifts: filterByRange(mine, range),
        stationName: station?.name || "",
      }),
    [mine, station]
  );

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("history.title")} />
        <div className="content">
          <LoadingPanels count={2} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("history.title")}
        sub={station?.name || ""}
        actions={
          <ReportSheet
            report="shifts"
            title="Shifts"
            stationName={station?.name || ""}
            buildReport={buildReport}
            note={t("report.scopedToYou")}
          />
        }
      />
      <div className="content stack history-screen">
        {error && (
          <Notice kind="error">
            {error}{" "}
            <button type="button" className="quiet notice__action" onClick={load}>
              {t("common.retry")}
            </button>
          </Notice>
        )}
        {loading ? (
          <LoadingPanels count={3} lines={3} label={t("common.loading")} />
        ) : mine.length === 0 ? (
          <div className="empty-card empty-card--compact">
            <h2>{t("history.emptyTitle")}</h2>
            <p className="small muted">{t("history.emptyBody")}</p>
          </div>
        ) : (
          <div className="history-list">
            {mine.map((shift) => {
              const totals = shiftTotals(shift);
              return (
                <Link
                  key={shift.id}
                  to={`/today/history/${shift.id}`}
                  className="history-card"
                >
                  <div className="history-card__head">
                    <div>
                      <strong>{formatDate(shift.date)}</strong>
                      <span>{shift.employeeName || profile.name}</span>
                    </div>
                    <StatusTag status={shift.status} />
                  </div>
                  <div className="history-card__nozzles">
                    {(shift.nozzles || []).map((nozzle) => (
                      <span
                        key={nozzle.nozzleId}
                        className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                        title={nozzle.label}
                      />
                    ))}
                    {tn(shift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}
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
                  <div className="history-card__metrics">
                    <div>
                      <span>{t("shifts.litres")}</span>
                      <strong className="mono">{litres(totals.totalLitres)} L</strong>
                    </div>
                    <div>
                      <span>{t("shifts.variance")}</span>
                      {totals.variance == null ? (
                        <strong className="mono muted">—</strong>
                      ) : (
                        <Money
                          kind="variance"
                          value={totals.variance}
                          label={`${formatDate(shift.date)} · ${t("shifts.variance")}`}
                        />
                      )}
                    </div>
                    <div className="history-card__time">
                      <span>{t("shifts.started")}</span>
                      <strong>{formatStamp(shift.startTime)}</strong>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
