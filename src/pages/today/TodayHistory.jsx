import { useCallback, useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { HistoryIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { SHIFT_STATUS } from "../../lib/shiftMath";
import { scopeShiftsToViewer, shiftsReport, filterByRange } from "../../lib/export.js";
import { ShiftCard } from "../shifts/ShiftCards.jsx";
import ShiftTabs, {
  SHIFT_TAB,
  bucketCounts,
  filterShifts,
  shiftTabDefs,
} from "../shifts/ShiftTabs.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

function emptyForTab(tab, t) {
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
 * The attendant's own closed shifts: split into All, Review and Closed in the
 * same card language as the station shift list. Scoping stays as it was —
 * the viewer's own shifts only, enforced again here on top of RLS.
 */
export default function TodayHistory() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { station, stationId, loading: stationsLoading } = useStation();
  const [shifts, setShifts] = useState([]);
  const [tab, setTab] = useState(SHIFT_TAB.ALL);
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
  const counts = useMemo(() => bucketCounts(mine), [mine]);
  const tabs = useMemo(() => shiftTabDefs(t, counts, { showLive: false }), [t, counts]);
  const visible = useMemo(() => filterShifts(mine, tab), [mine, tab]);

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

  const tabEmpty = emptyForTab(tab, t);

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
            <div className="empty-card__icon" aria-hidden="true">
              <HistoryIcon size={26} />
            </div>
            <h2>{t("history.emptyTitle")}</h2>
            <p className="small muted">{t("history.emptyBody")}</p>
          </div>
        ) : (
          <>
            <ShiftTabs
              tabs={tabs}
              value={tab}
              onChange={setTab}
              label={t("history.title")}
            />
            {visible.length === 0 ? (
              <div className="empty-card empty-card--compact">
                <div className="empty-card__icon" aria-hidden="true">
                  <HistoryIcon size={26} />
                </div>
                <h2>{tabEmpty.title}</h2>
                <p className="small muted">{tabEmpty.body}</p>
              </div>
            ) : (
              <div className="shift-feed">
                {visible.map((shift) => (
                  <div key={shift.id} className="row-enter">
                    <ShiftCard
                      shift={shift}
                      to={`/today/history/${shift.id}`}
                      title={formatDate(shift.date)}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
