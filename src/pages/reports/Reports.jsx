import { useCallback, useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice, Segmented, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { money, todayISO } from "../../lib/format";
import { SHIFT_STATUS, varianceTone } from "../../lib/shiftMath";
import { changePct, monthOf, monthReport, shiftMonth } from "../../lib/reportMath.js";
import { fuelClass } from "../../lib/fuel.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The month on one screen, for owners and managers: a month dial, the
 * headline figures, how they moved against last month, the week-by-week
 * shape of the trade and the fuel mix.
 *
 * Everything is folded from the SAME settled shifts the ledger lists,
 * through the same shiftTotals — a different grouping of the same figures,
 * never a second source of truth, so report and ledger cannot disagree.
 */
export default function Reports() {
  const { t, language } = useLanguage();
  const {
    stations,
    station,
    stationId,
    setStation,
    loading: stationsLoading,
  } = useStation();

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => monthOf(todayISO()));
  const [measure, setMeasure] = useState("litres");

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      // Only settled shifts count — an open shift has no closing readings,
      // so it has no litres or cash to report yet.
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

  const report = useMemo(() => monthReport(shifts, month), [shifts, month]);
  const previous = useMemo(
    () => monthReport(shifts, shiftMonth(month, -1)),
    [shifts, month]
  );

  // The dial never points past today: next month has no shifts by
  // definition, and offering it reads like data is missing.
  const atCurrentMonth = month >= monthOf(todayISO());

  const monthName = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, {
      month: "long",
      year: "numeric",
    });
    return formatter.format(new Date(`${month}-01T00:00:00`));
  }, [language, month]);

  // Only movements worth saying: a null change is a dead previous month
  // (no trend), and a sub-half-percent move rounds to "+0%" — noise.
  const trend = useMemo(() => {
    const lines = [
      [t("ledger.fuelSales"), changePct(report.sales, previous.sales)],
      [t("reports.litres"), changePct(report.litres, previous.litres)],
      [t("ledger.expenses"), changePct(report.expenses, previous.expenses)],
    ];
    return lines
      .filter(([, pct]) => pct != null && Math.round(pct) !== 0)
      .map(
        ([label, pct]) => `${label} ${pct > 0 ? "+" : "−"}${Math.abs(Math.round(pct))}%`
      )
      .join(" · ");
  }, [report, previous, t]);

  const weekMax = Math.max(...report.weeks.map((week) => week[measure]));

  const fuelRows = useMemo(
    () =>
      Object.entries(report.fuels)
        .map(([fuel, value]) => ({ fuel, ...value }))
        .sort((a, b) => b.litres - a.litres),
    [report]
  );

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("reports.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("reports.title")}
        sub={
          station ? `${station.name} · ${t("reports.subtitle")}` : t("reports.subtitle")
        }
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : (
          <>
            {/* ---- which month ---- */}
            <section className="card month-dial">
              <button
                type="button"
                className="month-dial__arrow"
                aria-label={t("reports.prevMonth")}
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
              >
                <ChevronIcon size={18} />
              </button>
              <div className="month-dial__label">
                <div className="month-dial__name">{monthName}</div>
                <div className="small muted">
                  {t("ledger.shifts")} {report.shifts} · {t("reports.daysWorked")}{" "}
                  {report.days}
                </div>
              </div>
              <button
                type="button"
                className="month-dial__arrow month-dial__arrow--next"
                aria-label={t("reports.nextMonth")}
                disabled={atCurrentMonth}
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
              >
                <ChevronIcon size={18} />
              </button>
            </section>

            {report.shifts === 0 ? (
              <div className="empty-card">
                <h2>{t("reports.emptyMonth")}</h2>
              </div>
            ) : (
              <>
                {/* ---- the headline figures ---- */}
                <section className="card stat-strip">
                  <Stat
                    label={t("ledger.litresSold")}
                    value={`${money(report.litres)} L`}
                  />
                  <Stat
                    label={t("ledger.fuelSales")}
                    value={`₹ ${money(report.sales)}`}
                  />
                  <Stat
                    label={t("ledger.expenses")}
                    value={`₹ ${money(report.expenses)}`}
                  />
                  <Stat
                    label={t("reports.netCash")}
                    value={`₹ ${money(report.sales - report.expenses)}`}
                  />
                  <Stat
                    label={t("ledger.onCredit")}
                    value={`₹ ${money(report.credit)}`}
                  />
                  <Stat
                    label={t("ledger.cashVariance")}
                    value={`₹ ${money(report.variance)}`}
                    tone={varianceTone(report.variance)}
                  />
                </section>

                {trend && (
                  <div className="small muted">
                    {t("reports.vsLastMonth")}: {trend}
                  </div>
                )}

                {/* ---- the week-by-week shape ---- */}
                <section className="card">
                  <div className="card__head">
                    <h2>{t("reports.weekly")}</h2>
                    <Segmented
                      value={measure}
                      onChange={setMeasure}
                      options={[
                        { value: "litres", label: t("reports.litres") },
                        { value: "sales", label: t("reports.sales") },
                      ]}
                    />
                  </div>
                  <div className="report-bars">
                    {report.weeks.map((week) => (
                      <div key={week.bucket} className="report-bars__col">
                        <span className="report-bars__value mono small">
                          {measure === "litres"
                            ? `${money(week.litres)} L`
                            : `₹ ${money(week.sales)}`}
                        </span>
                        <div className="report-bars__track">
                          <div
                            className="report-bars__bar"
                            style={{
                              // A 2% floor so a small week still shows a
                              // sliver rather than looking like missing data.
                              height: `${
                                weekMax > 0
                                  ? Math.max((week[measure] / weekMax) * 100, 2)
                                  : 2
                              }%`,
                            }}
                          />
                        </div>
                        <span className="report-bars__label small muted">
                          {t("reports.week")} {week.bucket + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ---- fuel mix ---- */}
                <section className="card card--flush">
                  <div className="card__head">
                    <h2>{t("reports.fuelMix")}</h2>
                  </div>
                  <table className="responsive-table">
                    <thead>
                      <tr>
                        <th>{t("ledger.fuel")}</th>
                        <th className="num">{t("shifts.litres")}</th>
                        <th className="num">{t("common.amount")}</th>
                        <th className="num">{t("reports.share")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuelRows.map((row) => (
                        <tr key={row.fuel}>
                          <td data-label={t("ledger.fuel")}>
                            <span
                              className="row"
                              style={{ gap: 6, alignItems: "center" }}
                            >
                              <span
                                className={`fuel-dot fuel-dot--${fuelClass(row.fuel)}`}
                              />
                              {row.fuel}
                            </span>
                          </td>
                          <td data-label={t("shifts.litres")} className="num mono">
                            {money(row.litres)}
                          </td>
                          <td data-label={t("common.amount")} className="num mono">
                            {money(row.revenue)}
                          </td>
                          <td data-label={t("reports.share")} className="num mono">
                            {report.litres > 0
                              ? `${Math.round((row.litres / report.litres) * 100)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
