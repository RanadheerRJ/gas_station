import { useCallback, useEffect, useMemo, useState } from "react";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { creditDaySummary, listCustomerTransactions, readableError } from "../../lib/api";
import { formatDayLabel, money } from "../../lib/format";
import { entryTime } from "../../lib/statement.js";

const pad = (n) => String(n).padStart(2, "0");
const iso = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The inclusive date window for a named range chip. */
export function activityRange(key, today = new Date(), custom = null) {
  const day = new Date(today);
  if (key === "yesterday") {
    day.setDate(day.getDate() - 1);
    return { from: iso(day), to: iso(day) };
  }
  if (key === "week") {
    const start = new Date(today);
    // Monday-first, the way a station's week is counted.
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return { from: iso(start), to: iso(today) };
  }
  if (key === "month") {
    return {
      from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: iso(today),
    };
  }
  if (key === "custom" && custom) return { ...custom };
  return { from: iso(today), to: iso(today) };
}

const DATE_CHIPS = [
  ["today", "credit.dateToday"],
  ["yesterday", "credit.dateYesterday"],
  ["week", "credit.dateThisWeek"],
  ["month", "credit.periodThisMonth"],
  ["custom", "credit.periodCustom"],
];

/** Entries shown before the list asks to be expanded. */
const PREVIEW_ROWS = 6;

const STATUS_CHIPS = [
  ["all", "credit.all"],
  ["active", "credit.statusActive"],
  ["edited", "credit.statusEdited"],
  ["voided", "credit.statusVoided"],
];

/**
 * The station's credit movement, for an owner or manager.
 *
 * Today's figures come from one aggregate RPC — not from adding up every
 * customer's history in the browser — and voided entries are excluded from
 * them by the database. The list below is the same ledger with the filters
 * applied in SQL, so a filter is never the only thing keeping one station's
 * rows out of another's screen.
 */
export default function CreditActivity({ stationId }) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateKey, setDateKey] = useState("today");
  const [custom, setCustom] = useState(() => activityRange("today"));
  const [status, setStatus] = useState("all");
  const [attendant, setAttendant] = useState("");
  const [shift, setShift] = useState("");
  const [expanded, setExpanded] = useState(false);

  const range = useMemo(
    () => activityRange(dateKey, new Date(), custom),
    [dateKey, custom]
  );

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [day, ledger] = await Promise.all([
        creditDaySummary(stationId),
        listCustomerTransactions(stationId, {
          from: range.from,
          to: range.to,
          status,
          recordedBy: attendant || null,
          shiftId: shift || null,
        }),
      ]);
      setSummary(day);
      setRows(ledger);
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, range.from, range.to, status, attendant, shift]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter options come from the rows already on screen: no extra round trip.
  const attendants = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
      if (row.recordedBy) seen.set(row.recordedBy, row.recordedByName || "—");
    });
    return [...seen.entries()];
  }, [rows]);
  const shifts = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
      if (row.shiftId) seen.set(row.shiftId, row.shiftLabel || "—");
    });
    return [...seen.entries()];
  }, [rows]);

  // How many filters are away from their default, so the collapsed control
  // can say so rather than hiding a narrowed list behind a closed drawer.
  const activeFilters =
    (dateKey === "today" ? 0 : 1) +
    (status === "all" ? 0 : 1) +
    (attendant ? 1 : 0) +
    (shift ? 1 : 0);

  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <section className="card card--flush credit-activity">
      <div className="card__head credit-activity__head">
        <h2>{t("credit.todayHeading")}</h2>
        <span
          className={`credit-activity__net ${
            Number(summary?.netCredit || 0) > 0 ? "neg" : "pos"
          }`}
        >
          {t("credit.netCredit")} <b>₹ {money(Number(summary?.netCredit || 0))}</b>
        </span>
      </div>
      {error && (
        <div className="section-pad">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="stat-strip">
        <Stat
          label={t("credit.creditGiven")}
          amount={Number(summary?.creditGiven || 0)}
          format={money}
          prefix="₹ "
          tone="neg"
        />
        <Stat
          label={t("credit.payments")}
          amount={Number(summary?.payments || 0)}
          format={money}
          prefix="₹ "
          tone="pos"
        />
        <Stat
          label={t("credit.netCredit")}
          amount={Number(summary?.netCredit || 0)}
          format={money}
          prefix="₹ "
        />
      </div>
      <p className="credit-activity__counts section-pad small muted">
        <span>{t("credit.entriesCount", { count: Number(summary?.entries || 0) })}</span>
        <span>
          {t("credit.customersCount", { count: Number(summary?.customers || 0) })}
        </span>
        <span>
          {t("credit.attendantsCount", { count: Number(summary?.attendants || 0) })}
        </span>
      </p>

      <details className="credit-drawer section-pad">
        <summary className="credit-drawer__summary">
          <span>{t("credit.filters")}</span>
          {activeFilters > 0 && (
            <span className="credit-drawer__badge">
              {t("credit.filtersActive", { count: activeFilters })}
            </span>
          )}
        </summary>
        <div className="credit-filters credit-drawer__body">
          <div className="filter-chips" role="group" aria-label={t("credit.filterDate")}>
            {DATE_CHIPS.map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={dateKey === key ? "active" : ""}
                onClick={() => setDateKey(key)}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {dateKey === "custom" && (
            <div className="statement__custom">
              <label className="field">
                <span>{t("report.from")}</span>
                <input
                  type="date"
                  className="mono"
                  value={custom.from}
                  onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t("report.to")}</span>
                <input
                  type="date"
                  className="mono"
                  value={custom.to}
                  onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                />
              </label>
            </div>
          )}
          <div
            className="filter-chips"
            role="group"
            aria-label={t("credit.filterStatus")}
          >
            {STATUS_CHIPS.map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={status === key ? "active" : ""}
                onClick={() => setStatus(key)}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div className="credit-filters__selects">
            <label className="field">
              <span>{t("credit.filterAttendant")}</span>
              <select value={attendant} onChange={(e) => setAttendant(e.target.value)}>
                <option value="">{t("credit.all")}</option>
                {attendants.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("credit.filterShift")}</span>
              <select value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="">{t("credit.all")}</option>
                {shifts.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </details>

      <div className="card__head credit-activity__subhead">
        <h3>{t("credit.recentEntries")}</h3>
        {rows.length > PREVIEW_ROWS && (
          <button
            type="button"
            className="credit-link"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded
              ? t("credit.showFewer")
              : t("credit.showAllEntries", { count: rows.length })}
          </button>
        )}
      </div>

      {loading ? (
        <div className="section-pad">
          <LoadingPanels count={2} lines={2} label={t("common.loading")} />
        </div>
      ) : rows.length === 0 ? (
        <p className="small muted section-pad">{t("credit.noTransactionsInRange")}</p>
      ) : (
        <ul className="st-group__rows">
          {shown.map((row) => {
            const debit = row.type === "credit";
            const voided = row.status === "voided";
            return (
              <li className={`st-row${voided ? " st-row--voided" : ""}`} key={row.id}>
                <div className="st-row__main">
                  <span className="st-row__desc">{row.customerName}</span>
                  <span className="st-row__sub">
                    {[
                      formatDayLabel(row.date),
                      entryTime(row.recordedAt),
                      row.recordedByName,
                      row.shiftLabel || t("credit.shiftHistorical"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {voided && (
                    <span className="tag rust">
                      {t("credit.voided")}
                      {row.voidReason ? ` · ${row.voidReason}` : ""}
                    </span>
                  )}
                  {!voided && row.editCount > 0 && (
                    <span className="tag">{t("credit.corrected")}</span>
                  )}
                </div>
                <div className="st-row__figures">
                  <span className={`st-row__amt ${debit ? "is-debit" : "is-credit"}`}>
                    {debit ? "+" : "−"}₹{money(row.amount)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
