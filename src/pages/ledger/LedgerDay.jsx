import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import Money from "../../components/Money.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import { PAYMENT_MODES } from "../../lib/shiftMath";
import { filterByRange, shiftStatementReport } from "../../lib/export.js";
import { PAYMENT_KEY } from "../shifts/parts.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { listShifts, readableError } from "../../lib/api";
import { formatDate, formatStamp, money, num } from "../../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { ledgerBase } from "./LedgerList.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** A receipt section: a card behind a native disclosure. */
function Section({ title, children }) {
  return (
    <details className="shift-collapse" open>
      <summary className="shift-collapse__summary">
        <span>{title}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="shift-collapse__body">{children}</div>
    </details>
  );
}

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
      payments: rows.reduce((acc, row) => {
        PAYMENT_MODES.forEach((mode) => {
          acc[mode] = (acc[mode] || 0) + num(row.totals.payments?.[mode]);
        });
        return acc;
      }, {}),
      creditEntries: rows.flatMap((row) =>
        (row.shift.creditSales || []).map((c) => ({
          ...c,
          employeeName: row.shift.employeeName,
        }))
      ),
      expenseEntries: rows.flatMap((row) =>
        (row.shift.expenses || []).map((e) => ({
          ...e,
          employeeName: row.shift.employeeName,
        }))
      ),
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
        actions={
          // The day is the day: `fixedRange` pins the window, so the sheet
          // offers no range input that could not lead anywhere.
          <ReportSheet
            report="shifts"
            title={t("shifts.statement")}
            fileTitle="Daily Sales Statement"
            stationName={station?.name || ""}
            buildReport={(range, filters = {}) =>
              shiftStatementReport({
                shifts: filterByRange(shifts, range),
                stationName: station?.name || "",
                range,
                ...filters,
              })
            }
            range={{ from: date, to: date }}
            fixedRange
          />
        }
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
              <Stat
                label={t("ledger.fuelSales")}
                value={
                  <Money kind="neutral" value={day.sales} label={t("ledger.fuelSales")} />
                }
              />
              <Stat
                label={t("ledger.expenses")}
                value={
                  <Money kind="out" value={day.expenses} label={t("ledger.expenses")} />
                }
              />
              <Stat
                label={t("ledger.cashVariance")}
                value={
                  <Money
                    kind="variance"
                    value={day.variance}
                    label={t("ledger.cashVariance")}
                  />
                }
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
                    <span
                      className={`fuel-dot fuel-dot--${fuelClass(totals.lines[0]?.fuelType)}`}
                    />
                    <span className="reading-row__label">
                      {shift.employeeName}
                      <span className="muted small">{formatStamp(shift.endTime)}</span>
                    </span>
                    <span className="reading-row__value mono">
                      {money(totals.totalLitres)} L
                    </span>
                    <span className="reading-row__price">
                      <Money
                        kind="neutral"
                        value={totals.gross}
                        label={t("shifts.grossSales")}
                      />
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <Section title={t("ledger.byFuel")}>
              <section className="card card--flush">
                <div className="card__head">
                  <h2>{t("ledger.byFuel")}</h2>
                </div>
                <table className="responsive-table">
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
                        <td data-label={t("ledger.fuel")}>
                          <span className="row" style={{ gap: 6, alignItems: "center" }}>
                            <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />
                            {fuel}
                          </span>
                        </td>
                        <td data-label={t("shifts.litres")} className="num mono">
                          {money(value.litres)}
                        </td>
                        <td data-label={t("common.amount")} className="num">
                          <Money
                            kind="neutral"
                            value={value.amount}
                            label={`${fuel} · ${t("common.amount")}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td data-label={t("ledger.fuel")}>{t("common.total")}</td>
                      <td data-label={t("shifts.litres")} className="num mono">
                        {money(day.litres)}
                      </td>
                      <td data-label={t("common.amount")} className="num">
                        <Money
                          kind="neutral"
                          value={day.sales}
                          label={t("ledger.fuelSales")}
                        />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            </Section>

            <Section title={t("ledger.paymentsByMode")}>
              <section className="card">
                <dl className="ledger-kv">
                  {PAYMENT_MODES.map((mode) => (
                    <div key={mode}>
                      <dt>{t(PAYMENT_KEY[mode])}</dt>
                      <dd>
                        <Money
                          kind={mode === "credit" ? "credit" : "in"}
                          value={day.payments[mode] || 0}
                          label={t(PAYMENT_KEY[mode])}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </Section>

            <Section title={t("shifts.creditSalesHeading")}>
              <section className="card">
                {day.creditEntries.length === 0 ? (
                  <p className="small muted">{t("credit.noCreditYet")}</p>
                ) : (
                  <ul className="ledger-lines">
                    {day.creditEntries.map((c, i) => (
                      <li key={i}>
                        <span>
                          {c.name || c.customerName || t("shifts.walkIn")}{" "}
                          <span className="small muted">{c.employeeName}</span>
                        </span>
                        <Money
                          kind="credit"
                          value={c.amount}
                          label={t("ledger.credit")}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </Section>

            <Section title={t("ledger.expenses")}>
              <section className="card">
                {day.expenseEntries.length === 0 ? (
                  <p className="small muted">{t("common.none")}</p>
                ) : (
                  <ul className="ledger-lines">
                    {day.expenseEntries.map((e, i) => (
                      <li key={i}>
                        <span>
                          {e.label || e.note || t("ledger.expenses")}{" "}
                          <span className="small muted">{e.employeeName}</span>
                        </span>
                        <Money kind="out" value={e.amount} label={t("ledger.expenses")} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </Section>

            <Section title={t("ledger.stockMovement")}>
              <section className="card">
                <ul className="ledger-lines">
                  {Object.entries(day.fuels).map(([fuel, v]) => (
                    <li key={fuel}>
                      <span>
                        <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />{" "}
                        {fuel}
                      </span>
                      <span className="mono">{money(v.litres)} L</span>
                    </li>
                  ))}
                </ul>
              </section>
            </Section>
          </>
        )}
      </div>
    </>
  );
}
