import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Sheet from "./Sheet.jsx";
import ReportTools from "./ReportTools.jsx";
import ReportFilterBar, { reportFilters } from "./ReportFilterBar.jsx";
import { DownloadIcon } from "./icons.jsx";
import { defaultRange, reportScopeLine } from "../lib/export.js";
import { formatDate } from "../lib/format.js";
import { useLanguage } from "../state/LanguageContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { listStaff } from "../lib/api";

/** "43 rows in range", "1 row in range", "No rows" — never "1 rows". */
function countLabel(t, rowCount) {
  if (rowCount === 0) return t("report.noRowsShort");
  return rowCount === 1
    ? t("report.rowCountOne", { count: rowCount })
    : t("report.rowCount", { count: rowCount });
}

/**
 * Exports as a sheet, not a fixture of every list screen.
 *
 * It reads as one task from top to bottom: what is about to be written (the
 * summary card, with the row count already worked out), what is in scope
 * (fuel, employee, status), the window, then the two buttons — pinned to the
 * bottom of the sheet so the thumb reaches them without scrolling, the way
 * the checkout bar sits on every other screen.
 *
 * The sheet owns the range and the filters, and `buildReport(range, filters)`
 * is supplied by the caller closing over whatever data the screen already
 * loaded: this component never fetches. That is what keeps a downloaded file
 * identical to the rows on the screen behind it.
 *
 * Performance:
 * - Staff list fetched only when sheet opens and only for reports that need it.
 * - buildReport result memoized — avoids recomputing rows on every render.
 * - Callbacks use useCallback to keep ReportFilterBar from re-rendering needlessly.
 */
function ReportSheet({
  report,
  title,
  // The heading written into the PDF. Defaults to `title`, but a translated
  // title would reach the standard PDF fonts as "?????" — so a screen in
  // Telugu or Hindi passes an English heading for the file and keeps its own
  // language on screen.
  fileTitle = "",
  stationName,
  // What the report is about when that is narrower than the station — one
  // credit customer's statement, say. It rides in the summary card and in the
  // file's own title line, so a printed statement names its customer.
  subject = "",
  buildReport,
  note,
  // When a screen already has a period selector (the credit statement does),
  // it passes its own range in so the export window and the rows on screen
  // can never disagree. `fixedRange` pins the window completely — the day
  // view exports that day and offers nothing to edit.
  range: controlledRange,
  onRangeChange,
  fixedRange = false,
  // The window to open on. The monthly report dials a month, so its export
  // opens on that month rather than on today's month-to-date.
  openingRange,
  label,
  triggerClassName = "tool-btn",
  // A screen with its own tile for the export (the report tiles are cards)
  // passes `trigger`, which is handed a function that opens the sheet — so the
  // whole tile is the control instead of a card that looks tappable and is not.
  trigger,
}) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [filters, setFilters] = useState({
    fuelGroup: "ALL",
    employeeId: "",
    employeeName: "",
    status: "ALL",
  });
  const [staff, setStaff] = useState([]);
  const privileged = profile?.role === "owner" || profile?.role === "manager";
  const [open, setOpen] = useState(false);
  const [ownRange, setOwnRange] = useState(() => openingRange || defaultRange());
  const controlled = Boolean(
    fixedRange ? controlledRange : controlledRange && onRangeChange
  );
  const range = controlled ? controlledRange : ownRange;

  const setRange = useCallback(
    (next) => {
      if (fixedRange) return;
      if (controlled) onRangeChange?.(next);
      else setOwnRange(next);
    },
    [fixedRange, controlled, onRangeChange]
  );

  // Only fetch the staff list when the chosen report actually scopes by
  // employee, so opening a stock export never touches the API.
  const scope = useMemo(() => reportFilters(report), [report]);
  // Only the subject of an export the operator is allowed to pick: the staff
  // list behind the employee control is roster data, so the picker appears
  // for owners and managers and nobody else.
  const canScopeEmployee = privileged && scope.employee;

  useEffect(() => {
    if (!open || !canScopeEmployee) return undefined;
    let cancelled = false;
    listStaff(profile)
      .then((data) => {
        if (!cancelled) setStaff(data);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canScopeEmployee, profile]);

  // A caller that offers a window (a month on the dial) hands the sheet a
  // fresh one each time it opens; a range the operator typed is kept.
  const openingFrom = openingRange?.from || "";
  const openingTo = openingRange?.to || "";
  useEffect(() => {
    if (open && !controlled && openingFrom && openingTo) {
      setOwnRange({ from: openingFrom, to: openingTo });
    }
  }, [open, controlled, openingFrom, openingTo]);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  const handleFuelGroup = useCallback((fuelGroup) => setFilters((f) => ({ ...f, fuelGroup })), []);
  const handleEmployee = useCallback(
    (employeeId) =>
      setFilters((f) => ({
        ...f,
        employeeId,
        employeeName: staff.find((m) => m.uid === employeeId)?.name || "",
      })),
    [staff]
  );
  const handleStatus = useCallback((status) => setFilters((f) => ({ ...f, status })), []);

  const buildForRange = useCallback(() => buildReport(range, filters), [buildReport, range, filters]);

  const built = useMemo(
    () => {
      if (!open) return null;
      try {
        return buildReport(range, filters);
      } catch {
        return { rows: [] };
      }
    },
    [open, buildReport, range, filters]
  );
  const rowCount = built ? built.rows.length : 0;

  const meta = useMemo(
    () =>
      reportScopeLine({
        fuelGroup: filters.fuelGroup,
        showFuel: scope.fuel,
        employeeName: filters.employeeName,
        showEmployee: canScopeEmployee,
        status: filters.status,
        showStatus: scope.status,
      }),
    [filters, scope.fuel, canScopeEmployee, scope.status]
  );

  const windowLabel = useMemo(
    () =>
      range.from || range.to
        ? `${range.from ? formatDate(range.from) : "—"} → ${
            range.to ? formatDate(range.to) : "—"
          }`
        : t("report.allTime"),
    [range.from, range.to, t]
  );

  return (
    <>
      {trigger ? (
        trigger(handleOpen)
      ) : (
        <button type="button" className={triggerClassName} onClick={handleOpen}>
          <DownloadIcon size={16} />
          {label || t("report.title")}
        </button>
      )}
      <Sheet open={open} onClose={handleClose} title={t("report.title")} wide>
        <div className="report-sheet">
          <section className="export-summary" aria-label={t("report.readyTitle")}>
            <div className="export-summary__main">
              <span className="export-summary__label">{t("report.readyTitle")}</span>
              <strong className="export-summary__title">{title || report}</strong>
              {(subject || stationName) && (
                <span className="export-summary__station" title={subject || stationName}>
                  {[subject, stationName].filter(Boolean).join(" · ")}
                </span>
              )}
              <span className="export-summary__range small">{windowLabel}</span>
            </div>
            <span className={`export-summary__count${rowCount === 0 ? " is-empty" : ""}`}>
              {countLabel(t, rowCount)}
            </span>
          </section>

          <p className="small muted report-sheet__note">{t("report.note")}</p>

          <ReportFilterBar
            report={report}
            {...filters}
            onFuelGroup={handleFuelGroup}
            onEmployee={handleEmployee}
            onStatus={handleStatus}
            staff={staff}
            canScopeEmployee={canScopeEmployee}
          />

          <ReportTools
            report={report}
            title={title}
            fileTitle={fileTitle || title}
            stationName={stationName}
            subject={subject}
            range={range}
            onRangeChange={setRange}
            rowCount={rowCount}
            note={note}
            meta={meta}
            fixedRange={fixedRange}
            buildReport={buildForRange}
            filters={filters}
          />
        </div>
      </Sheet>
    </>
  );
}

export default memo(ReportSheet);
