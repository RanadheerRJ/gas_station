import { useLanguage } from "../state/LanguageContext.jsx";
import {
  downloadCsv,
  downloadPdf,
  reportFilename,
  reportSubtitle,
} from "../lib/export.js";

/**
 * The date-range control and the two export buttons, shared by every
 * reportable screen.
 *
 * The range it edits is the same state the screen filters its table with, so
 * a download can never contain a row the operator was not looking at. The
 * report itself is built by the caller — this component never fetches
 * anything, which keeps `src/lib/api.js` the only way data enters the app.
 */
export default function ReportTools({
  report,
  title,
  buildReport,
  stationName,
  range,
  onRangeChange,
  rowCount,
  note,
  disabled = false,
}) {
  const { t } = useLanguage();
  const empty = !rowCount;

  const run = (kind) => {
    const built = buildReport();
    if (!built || built.rows.length === 0) return;
    const filename = reportFilename({
      report,
      stationName,
      from: range.from,
      to: range.to,
      extension: kind,
    });
    if (kind === "csv") {
      downloadCsv(built, filename);
      return;
    }
    downloadPdf(
      {
        ...built,
        title: title || report,
        subtitle: reportSubtitle({ stationName, from: range.from, to: range.to }),
      },
      filename
    );
  };

  return (
    <div className="report-tools">
      <div className="report-tools__dates">
        <label className="field">
          <span>{t("report.from")}</span>
          <input
            type="date"
            className="mono"
            value={range.from}
            max={range.to || undefined}
            onChange={(event) => onRangeChange({ ...range, from: event.target.value })}
          />
        </label>
        <label className="field">
          <span>{t("report.to")}</span>
          <input
            type="date"
            className="mono"
            value={range.to}
            min={range.from || undefined}
            onChange={(event) => onRangeChange({ ...range, to: event.target.value })}
          />
        </label>
      </div>

      <div className="report-tools__actions">
        <button
          type="button"
          disabled={disabled || empty}
          onClick={() => run("csv")}
          title={empty ? t("report.noRows") : undefined}
        >
          {t("report.exportCsv")}
        </button>
        <button
          type="button"
          disabled={disabled || empty}
          onClick={() => run("pdf")}
          title={empty ? t("report.noRows") : undefined}
        >
          {t("report.exportPdf")}
        </button>
      </div>

      <div className="report-tools__meta small muted">
        {empty ? t("report.noRows") : t("report.rowCount", { count: rowCount })}
        {note ? ` · ${note}` : ""}
      </div>
    </div>
  );
}
