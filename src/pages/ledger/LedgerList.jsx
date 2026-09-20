import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, money, num } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceTone } from "../../lib/shiftMath";
import { filterByRange, ledgerReport } from "../../lib/export.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Where this role's ledger screens live, for links and the back arrow. */
export function ledgerBase(role) {
  return role === "owner" ? "/owner/ledger" : "/station/ledger";
}

/**
 * The day register as a list of day cards. Each day is derived entirely from
 * the shifts handed in that day; tapping one opens the day's own screen with
 * the per-shift and per-fuel breakdown.
 */
export default function LedgerList() {
  const { t, tn } = useLanguage();
  const {
    stations,
    station,
    stationId,
    setStation,
    link,
    loading: stationsLoading,
  } = useStation();
  const { profile } = useAuth();

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      // Everything handed in, whatever its review state — the ledger is the
      // money view, not the review view.
      setShifts(
        (await listShifts(stationId)).filter((s) => s.status !== SHIFT_STATUS.OPEN)
      );
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

  // Group closed shifts by date and total each day.
  const days = useMemo(() => {
    const byDate = new Map();
    shifts.forEach((shift) => {
      const totals = shiftTotals(shift);
      const day = byDate.get(shift.date) || {
        date: shift.date,
        shifts: 0,
        litres: 0,
        sales: 0,
        credit: 0,
        expenses: 0,
        declared: 0,
        variance: 0,
        fuels: {},
      };
      day.shifts += 1;
      day.litres += totals.totalLitres;
      day.sales += totals.gross;
      day.credit += num(totals.payments?.credit);
      day.expenses += totals.expensesTotal;
      day.declared += totals.declared ?? 0;
      day.variance += totals.variance ?? 0;
      Object.entries(totals.fuels).forEach(([fuel, value]) => {
        day.fuels[fuel] ||= { litres: 0, amount: 0 };
        day.fuels[fuel].litres += value.litres;
        day.fuels[fuel].amount += value.revenue;
      });
      byDate.set(shift.date, day);
    });
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [shifts]);

  const totals = useMemo(
    () => ({
      days: days.length,
      litres: days.reduce((sum, day) => sum + day.litres, 0),
      sales: days.reduce((sum, day) => sum + day.sales, 0),
      credit: days.reduce((sum, day) => sum + day.credit, 0),
      variance: days.reduce((sum, day) => sum + day.variance, 0),
    }),
    [days]
  );

  const buildReport = useCallback(
    (range) =>
      ledgerReport({
        days: filterByRange(days, range),
        stationName: station?.name || "",
      }),
    [days, station]
  );

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("ledger.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("ledger.title")}
        sub={station ? `${station.name} · ${t("ledger.subtitle")}` : t("ledger.subtitle")}
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
        actions={
          <ReportSheet
            report="ledger"
            title="Daily ledger"
            stationName={station?.name || ""}
            buildReport={buildReport}
          />
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : days.length === 0 ? (
          <div className="empty-card">
            <h2>{t("ledger.empty")}</h2>
          </div>
        ) : (
          <>
            <section className="card stat-strip">
              <Stat label={t("ledger.litresSold")} value={`${money(totals.litres)} L`} />
              <Stat label={t("ledger.fuelSales")} value={`₹ ${money(totals.sales)}`} />
              <Stat label={t("ledger.onCredit")} value={`₹ ${money(totals.credit)}`} />
              <Stat
                label={t("ledger.cashVariance")}
                value={`₹ ${money(totals.variance)}`}
                tone={varianceTone(totals.variance)}
              />
            </section>

            <div className="list-stack">
              {days.map((day) => (
                <Link
                  key={day.date}
                  to={link(`${ledgerBase(profile?.role)}/${day.date}`)}
                  className="list-card"
                >
                  <div className="list-card__row">
                    <span className="list-card__title">
                      {formatDate(day.date)}
                      <span className="small muted">
                        {tn(day.shifts, "ledger.day", "ledger.days")}
                      </span>
                    </span>
                    <span
                      className={`mono small ${
                        varianceTone(day.variance) === "neg" ? "neg" : "pos"
                      }`}
                      style={{ fontWeight: 650 }}
                    >
                      ₹ {money(day.variance)}
                    </span>
                  </div>
                  <div className="list-card__row list-card__row--figures">
                    <span className="list-card__figure">
                      <span className="k">{t("shifts.litres")}</span>
                      <span className="v mono">{money(day.litres)} L</span>
                    </span>
                    <span className="list-card__figure">
                      <span className="k">{t("ledger.fuelSales")}</span>
                      <span className="v mono">₹ {money(day.sales)}</span>
                    </span>
                    <span className="list-card__figure">
                      <span className="k">{t("ledger.collected")}</span>
                      <span className="v mono">₹ {money(day.declared)}</span>
                    </span>
                    <span className="list-card__chev">
                      <ChevronIcon size={17} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
