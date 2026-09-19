import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, money } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceTone } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { ledgerBase } from "./LedgerList.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * One day of the ledger, on its own screen: the shifts that made the day and
 * the fuel mix, in full — everything the compact row on the list was
 * summarising.
 */
export default function LedgerDay() {
  const { t } = useLanguage();
  const { date } = useParams();
  const { profile } = useAuth();
  const { station, stationId, link, loading: stationsLoading } = useStation();
  const base = ledgerBase(profile.role);

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      setShifts(
        (await listShifts(stationId)).filter(
          (s) => s.status !== SHIFT_STATUS.OPEN && s.date === date
        )
      );
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const day = useMemo(() => {
    const rows = shifts.map((shift) => ({ shift, totals: shiftTotals(shift) }));
    return {
      rows,
      litres: rows.reduce((sum, row) => sum + row.totals.totalLitres, 0),
      sales: rows.reduce((sum, row) => sum + row.totals.gross, 0),
      expenses: rows.reduce((sum, row) => sum + row.totals.expensesTotal, 0),
      declared: rows.reduce((sum, row) => sum + (row.totals.declared ?? 0), 0),
      variance: rows.reduce((sum, row) => sum + (row.totals.variance ?? 0), 0),
      fuels: rows.reduce((fuels, row) => {
        Object.entries(row.totals.fuels).forEach(([fuel, value]) => {
          fuels[fuel] ||= { litres: 0, amount: 0 };
          fuels[fuel].litres += value.litres;
          fuels[fuel].amount += value.revenue;
        });
        return fuels;
      }, {}),
    };
  }, [shifts]);

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={formatDate(date)} back={link(base)} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ScreenHeader title={formatDate(date)} back={link(base)} />
        <div className="content">
          <Notice kind="error">{error}</Notice>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={formatDate(date)}
        sub={station ? station.name : ""}
        back={link(base)}
      />
      <div className="content stack">
        {day.rows.length === 0 ? (
          <div className="empty-card">
            <h2>{t("ledger.empty")}</h2>
          </div>
        ) : (
          <>
            <section className="card stat-strip">
              <Stat label={t("ledger.litresSold")} value={`${money(day.litres)} L`} />
              <Stat label={t("ledger.fuelSales")} value={`₹ ${money(day.sales)}`} />
              <Stat label={t("ledger.expenses")} value={`₹ ${money(day.expenses)}`} />
              <Stat
                label={t("ledger.cashVariance")}
                value={`₹ ${money(day.variance)}`}
                tone={varianceTone(day.variance)}
              />
            </section>

            <section className="card card--flush">
              <div className="card__head">
                <h2>{t("ledger.shifts")}</h2>
              </div>
              <div>
                {day.rows.map(({ shift, totals }) => (
                  <Link
                    key={shift.id}
                    to={link(
                      profile.role === "owner"
                        ? `/owner/shifts/${shift.id}`
                        : `/station/shift/${shift.id}`
                    )}
                    className="reading-row"
                  >
                    <span className={`fuel-dot fuel-dot--${fuelClass(totals.lines[0]?.fuelType)}`} />
                    <span className="reading-row__label">
                      {shift.employeeName}
                      <span className="muted small">{formatStamp(shift.endTime)}</span>
                    </span>
                    <span className="reading-row__value mono">
                      {money(totals.totalLitres)} L
                    </span>
                    <span className="reading-row__price mono">₹ {money(totals.gross)}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="card card--flush">
              <div className="card__head">
                <h2>{t("ledger.byFuel")}</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>{t("ledger.fuel")}</th>
                    <th className="num">{t("shifts.litres")}</th>
                    <th className="num">{t("common.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(day.fuels).map(([fuel, value]) => (
                    <tr key={fuel}>
                      <td>
                        <span className="row" style={{ gap: 6, alignItems: "center" }}>
                          <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />
                          {fuel}
                        </span>
                      </td>
                      <td className="num mono">{money(value.litres)}</td>
                      <td className="num mono">{money(value.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t("common.total")}</td>
                    <td className="num mono">{money(day.litres)}</td>
                    <td className="num mono">{money(day.sales)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          </>
        )}
      </div>
    </>
  );
}
