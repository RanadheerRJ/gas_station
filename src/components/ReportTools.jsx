import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { Chip, ChipRow } from "./Chip.jsx";
import { Field } from "./ui.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";
import {
  DOWNLOAD_MODE,
  downloadCsv,
  downloadPdf,
  matchingRangeName,
  quickRanges,
  reportFilename,
  reportSubtitle,
} from "../lib/export.js";
import { formatDate } from "../lib/format.js";

/** The chip-able windows, in the order a month-end job walks them. */
const PRESETS = [
  ["thisMonth", "credit.periodThisMonth"],
  ["lastMonth", "credit.periodLastMonth"],
  ["last3Months", "credit.periodLast3Months"],
  ["thisYear", "report.thisYear"],
];

/** Both ends of a window, human-formatted; "—" where there is no date. */
function rangeText(range = {}) {
  return `${range.from ? formatDate(range.from) : "—"} → ${
    range.to ? formatDate(range.to) : "—"
  }`;
}

/**
 * The working half of the export sheet: pick a window, narrow it, download.
 *
 * Everything the operator can change lives here, and the report is built by
 * the caller, so the sheet never fetches anything — `src/lib/api.js` stays
 * the only way data enters the app. The buttons say what they will write
 * ("CSV · Excel, Sheets") rather than naming a file format, and the result
 * of the last download is reported underneath: silence is what makes an
 * export feel broken.
 *
 * Robustness & speed:
 * - `buildReport` is called inside a try/catch — a malformed range never crashes the sheet.
 * - Download is debounced via busy flag to prevent double-taps spawning two files.
 * - Range result is cleared when range/filters change so stale "saved" message can't mislead.
 * - Memoized preset calculation to avoid recomputing quickRanges on every parent render.
 */
function ReportTools({
  report,
  title,
  fileTitle,
  buildReport,
  stationName,
  subject = "",
  range,
  onRangeChange,
  rowCount,
  note,
  meta = "",
  disabled = false,
  fixedRange = false,
  filters = {},
}) {
  const { t } = useLanguage();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const empty = !rowCount;
  const presets = useMemo(() => quickRanges(), []);
  const activePreset = fixedRange ? "" : matchingRangeName(range);

  // A confirmation belongs to the file it describes: changing the window or a
  // filter clears it, so "CSV saved" can never sit under a different export.
  useEffect(() => {
    setResult(null);
  }, [range.from, range.to, filters.fuelGroup, filters.employeeId, filters.status]);

  const handleFrom = useCallback((event) => onRangeChange({ ...range, from: event.target.value }), [onRangeChange, range]);
  const handleTo = useCallback((event) => onRangeChange({ ...range, to: event.target.value }), [onRangeChange, range]);
  const handlePreset = useCallback((value) => () => onRangeChange({ ...presets[value] }), [onRangeChange, presets]);

  const run = useCallback(
    (kind) => {
      if (busy) return;
      let built;
      try {
        built = buildReport();
      } catch {
        setResult({ ok: false, text: t("report.blocked", { format: kind === "csv" ? "CSV" : "PDF" }) });
        return;
      }
      if (!built || built.rows.length === 0) return;
      setBusy(kind);
      try {
        const filename = reportFilename({
          report,
          stationName,
          from: range.from,
          to: range.to,
          extension: kind,
          fuelGroup: filters.fuelGroup === "ALL" ? "" : filters.fuelGroup,
          employeeName: filters.employeeName || "",
        });
        const outcome =
          kind === "csv"
            ? downloadCsv(built, filename)
            : downloadPdf(
                {
                  ...built,
                  title: fileTitle || title || report,
                  subtitle: reportSubtitle({
                    subject,
                    stationName,
                    from: range.from,
                    to: range.to,
                  }),
                  meta,
                },
                filename
              );
        const format = kind === "csv" ? "CSV" : "PDF";
        setResult({
          ok: Boolean(outcome?.ok),
          text: !outcome?.ok
            ? t("report.blocked", { format })
            : outcome.mode === DOWNLOAD_MODE.OPENED
              ? t("report.opened", { format })
              : t("report.saved", { format }),
        });
      } catch {
        setResult({ ok: false, text: t("report.blocked", { format: kind === "csv" ? "CSV" : "PDF" }) });
      } finally {
        // Release busy after a short delay so rapid double-tap is absorbed
        setTimeout(() => setBusy(null), 700);
      }
    },
    [buildReport, report, stationName, range.from, range.to, filters.fuelGroup, filters.employeeName, fileTitle, title, subject, meta, busy, t]
  );

  const onCsv = useCallback(() => run("csv"), [run]);
  const onPdf = useCallback(() => run("pdf"), [run]);

  return (
    <div className="report-tools">
      {fixedRange ? (
        <p className="report-tools__fixed small muted">{rangeText(range)}</p>
      ) : (
        <>
          <div
            className="report-tools__presets"
            role="group"
            aria-label={t("report.dateRange")}
          >
            <ChipRow label={t("report.dateRange")}>
              {PRESETS.map(([value, key]) => (
                <Chip
                  key={value}
                  label={t(key)}
                  selected={activePreset === value}
                  onClick={handlePreset(value)}
                />
              ))}
            </ChipRow>
          </div>

          <div className="report-tools__dates">
            <Field label={t("report.from")}>
              <input
                type="date"
                className="mono"
                value={range.from}
                max={range.to || undefined}
                onChange={handleFrom}
              />
            </Field>
            <Field label={t("report.to")}>
              <input
                type="date"
                className="mono"
                value={range.to}
                min={range.from || undefined}
                onChange={handleTo}
              />
            </Field>
          </div>
        </>
      )}

      <div className="report-tools__actions">
        <div className="report-tools__buttons">
          <button
            type="button"
            className="cta"
            disabled={disabled || empty || !!busy}
            onClick={onCsv}
            aria-busy={busy === "csv" || undefined}
          >
            {busy === "csv" ? <span className="spinner" aria-hidden="true" /> : null}
            {t("report.exportCsv")}
          </button>
          <button
            type="button"
            disabled={disabled || empty || !!busy}
            onClick={onPdf}
            aria-busy={busy === "pdf" || undefined}
          >
            {t("report.exportPdf")}
          </button>
        </div>
        <p className="report-tools__meta small muted">
          {empty ? t("report.noRows") : rangeText(range)}
          {note ? ` · ${note}` : ""}
        </p>
        {result && (
          <p
            className={`report-tools__result small${result.ok ? "" : " is-error"}`}
            role="status"
            aria-live="polite"
          >
            {result.text}
          </p>
        )}
      </div>
    </div>
  );
}

export default memo(ReportTools);
