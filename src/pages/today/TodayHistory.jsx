import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, money } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceTone } from "../../lib/shiftMath";
import { scopeShiftsToViewer } from "../../lib/export.js";
import { StatusTag } from "../shifts/parts.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { shiftsReport, filterByRange } from "../../lib/export.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Your past shifts, one list. Tap a row for the full read-only breakdown.
 * The register and the export share one filtered list — the viewer scope is
 * belt and braces, because RLS has already refused every shift but your own.
 */
export default function TodayHistory() {
  const { t } = useLanguage();
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
      scopeShiftsToViewer(shifts, profile).filter((s) => s.status !== SHIFT_STATUS.OPEN),
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
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("history.title")}
        sub={station ? station.name : ""}
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
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : mine.length === 0 ? (
          <div className="empty-card">
            <h2>{t("shifts.noneClosed")}</h2>
          </div>
        ) : (
          <div className="list-stack">
            {mine.map((shift) => {
              const totals = shiftTotals(shift);
              return (
                <Link
                  key={shift.id}
                  to={`/today/history/${shift.id}`}
                  className="list-card"
                >
                  <div className="list-card__row">
                    <span className="list-card__date mono small">
                      {formatDate(shift.date)}
                    </span>
                    <StatusTag status={shift.status} />
                  </div>
                  <div className="list-card__row list-card__row--figures">
                    <span className="list-card__figure">
                      <span className="k">{t("shifts.litres")}</span>
                      <span className="v mono">{money(totals.totalLitres)} L</span>
                    </span>
                    <span className="list-card__figure">
                      <span className="k">{t("shifts.net")}</span>
                      <span className="v mono">₹ {money(totals.net)}</span>
                    </span>
                    <span className="list-card__figure">
                      <span className="k">{t("shifts.variance")}</span>
                      <span
                        className={`v mono ${
                          varianceTone(totals.variance) === "neg" ? "neg" : "pos"
                        }`}
                      >
                        ₹ {money(totals.variance)}
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
      </div>
    </>
  );
}
