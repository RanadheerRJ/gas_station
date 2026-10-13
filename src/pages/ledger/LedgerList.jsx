import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import Money from "../../components/Money.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Sheet from "../../components/Sheet.jsx";
import { LedgerIcon } from "../../components/icons.jsx";
import { monthOf, shiftMonth } from "../../lib/reportMath.js";
import VariancePill from "../../components/VariancePill.jsx";
import { ChevronIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, money, num, todayISO } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { filterByRange, shiftStatementReport } from "../../lib/export.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Where this role's ledger screens live, for links and the back arrow. */
export function ledgerBase(role) {
  return role === "owner" ? "/owner/ledger" : "/station/ledger";
}

/** Days of one YYYY-MM month, newest first. */
export function daysInMonth(days, month) {
  return (days || []).filter((d) => String(d.date || "").startsWith(month));
}
/** Week-of-month buckets (1–7, 8–14, …) with their days, in order. */
export function groupDaysByWeek(days) {
  const groups = new Map();
  (days || []).forEach((d) => {
    const week = Math.floor((Number(String(d.date).slice(8, 10)) - 1) / 7);
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(d);
  });
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, items]) => ({ week, items }));
}
/** The month hero figures: sales, collections, expenses, net. */
export function monthTotals(days) {
  return (days || []).reduce(
    (acc, d) => ({
      sales: acc.sales + (d.sales || 0),
      collections: acc.collections + (d.declared || 0),
      expenses: acc.expenses + (d.expenses || 0),
      net: acc.net + (d.sales || 0) - (d.expenses || 0),
      litres: acc.litres + (d.litres || 0),
    }),
    { sales: 0, collections: 0, expenses: 0, net: 0, litres: 0 }
  );
}

/**
 * The day register as a list of day cards. Each day is derived entirely from
 * the shifts handed in that day; tapping one opens the day's own screen with
 * the per-shift and per-fuel breakdown.
 */
export default function LedgerList() {
  const { t, tn, language } = useLanguage();
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
  const [month, setMonth] = useState(() => monthOf(todayISO()));
  const [monthSheet, setMonthSheet] = useState(false);

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

  const monthDays = useMemo(() => daysInMonth(days, month), [days, month]);
  const hero = useMemo(() => monthTotals(monthDays), [monthDays]);
  const weeks = useMemo(() => groupDaysByWeek(monthDays), [monthDays]);
  const monthName = useMemo(
    () =>
      new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
        new Date(`${month}-01T00:00:00`)
      ),
    [language, month]
  );

  const buildReport = useCallback(
    (range, filters = {}) =>
      shiftStatementReport({
        shifts: filterByRange(shifts, range),
        stationName: station?.name || "",
        ...filters,
      }),
    [shifts, station]
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
            report="shifts"
            title="Daily Sales Statement"
            stationName={station?.name || ""}
            buildReport={buildReport}
          />
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <Skeleton shape="card" count={3} />
        ) : days.length === 0 ? (
          <EmptyState icon={LedgerIcon} headline={t("ledger.empty")} />
        ) : (
          <>
            <section className="card month-dial">
              <button
                type="button"
                className="month-dial__arrow"
                aria-label={t("reports.prevMonth")}
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
              >
                <ChevronIcon size={18} />
              </button>
              <button
                type="button"
                className="month-dial__label ledger-month-btn"
                aria-haspopup="dialog"
                onClick={() => setMonthSheet(true)}
              >
                <span className="month-dial__name">{monthName}</span>
                <span className="small muted">{t("ledger.chooseMonth")}</span>
              </button>
              <button
                type="button"
                className="month-dial__arrow month-dial__arrow--next"
                aria-label={t("reports.nextMonth")}
                disabled={month >= monthOf(todayISO())}
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
              >
                <ChevronIcon size={18} />
              </button>
            </section>

            <section className="card stat-strip" aria-label={monthName}>
              <Stat
                label={t("ledger.fuelSales")}
                value={
                  <Money
                    kind="neutral"
                    value={hero.sales}
                    label={t("ledger.fuelSales")}
                  />
                }
              />
              <Stat
                label={t("ledger.collected")}
                value={
                  <Money
                    kind="in"
                    value={hero.collections}
                    label={t("ledger.collected")}
                  />
                }
              />
              <Stat
                label={t("ledger.expenses")}
                value={
                  <Money kind="out" value={hero.expenses} label={t("ledger.expenses")} />
                }
              />
              <Stat
                label={t("reports.netCash")}
                value={
                  <Money kind="neutral" value={hero.net} label={t("reports.netCash")} />
                }
              />
            </section>

            {monthDays.length === 0 ? (
              <EmptyState icon={LedgerIcon} headline={t("ledger.emptyRange")} />
            ) : (
              weeks.map(({ week, items }) => (
                <section key={week} className="ledger-week">
                  <h2 className="ledger-week__title">
                    {t("reports.week")} {week + 1}
                  </h2>
                  <div className="list-stack">
                    {items.map((day) => (
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
                          <VariancePill variance={day.variance} />
                        </div>
                        <div className="list-card__row list-card__row--figures">
                          <span className="list-card__figure">
                            <span className="k">{t("shifts.litres")}</span>
                            <span className="v mono">{money(day.litres)} L</span>
                          </span>
                          <span className="list-card__figure">
                            <span className="k">{t("ledger.fuelSales")}</span>
                            <span className="v">
                              <Money
                                kind="neutral"
                                value={day.sales}
                                label={t("ledger.fuelSales")}
                              />
                            </span>
                          </span>
                          <span className="list-card__figure">
                            <span className="k">{t("ledger.collected")}</span>
                            <span className="v">
                              <Money
                                kind="neutral"
                                value={day.declared}
                                label={t("ledger.collected")}
                              />
                            </span>
                          </span>
                          <span className="list-card__chev">
                            <ChevronIcon size={17} />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </div>
      <Sheet
        open={monthSheet}
        onClose={() => setMonthSheet(false)}
        title={t("ledger.chooseMonth")}
      >
        <div className="stack">
          <input
            type="month"
            className="mono"
            value={month}
            max={monthOf(todayISO())}
            aria-label={t("ledger.chooseMonth")}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <button type="button" className="cta" onClick={() => setMonthSheet(false)}>
            {t("common.confirm")}
          </button>
        </div>
      </Sheet>
    </>
  );
}
