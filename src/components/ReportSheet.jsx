import { useEffect, useMemo, useState } from "react";
import Sheet from "./Sheet.jsx";
import ReportTools from "./ReportTools.jsx";
import { DownloadIcon } from "./icons.jsx";
import { defaultRange } from "../lib/export.js";
import { useLanguage } from "../state/LanguageContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { listStaff } from "../lib/api";
import ReportFilterBar from "./ReportFilterBar.jsx";

/**
 * Exports as a sheet, not a fixture of every list screen.
 *
 * The date range and the two download buttons live together in here, and the
 * sheet owns the range state — so the list screens can be pure lists while a
 * download still contains exactly the rows the selected station and range
 * produce. `buildReport(range)` is supplied by the caller and closes over
 * whatever data the screen already loaded; this component never fetches.
 */
export default function ReportSheet({
  report,
  title,
  stationName,
  buildReport,
  note,
  // When a screen already has a period selector (the credit statement does),
  // it passes its own range in so the export window and the rows on screen
  // can never disagree. Left out, the sheet keeps its own month-to-date range.
  range: controlledRange,
  onRangeChange,
  label,
  triggerClassName = "tool-btn",
}) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [filters, setFilters] = useState({
    fuelGroup: "ALL",
    employeeId: "",
    status: "ALL",
  });
  const [staff, setStaff] = useState([]);
  const privileged = profile?.role === "owner" || profile?.role === "manager";
  const [open, setOpen] = useState(false);
  const [ownRange, setOwnRange] = useState(() => defaultRange());
  const controlled = Boolean(controlledRange && onRangeChange);
  const range = controlled ? controlledRange : ownRange;
  const setRange = controlled ? onRangeChange : setOwnRange;
  useEffect(() => {
    if (open && privileged)
      listStaff(profile)
        .then(setStaff)
        .catch(() => setStaff([]));
  }, [open, privileged, profile]);

  const built = useMemo(
    () => (open ? buildReport(range, filters) : null),
    [open, buildReport, range, filters]
  );
  const rowCount = built ? built.rows.length : 0;

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        <DownloadIcon size={16} />
        {label || t("report.title")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("report.title")} wide>
        {privileged && (
          <ReportFilterBar
            report={report}
            {...filters}
            onFuelGroup={(fuelGroup) => setFilters((f) => ({ ...f, fuelGroup }))}
            onEmployee={(employeeId) =>
              setFilters((f) => ({
                ...f,
                employeeId,
                employeeName: staff.find((m) => m.uid === employeeId)?.name || "",
              }))
            }
            onStatus={(status) => setFilters((f) => ({ ...f, status }))}
            staff={staff}
          />
        )}
        <ReportTools
          report={report}
          title={title}
          stationName={stationName}
          range={range}
          onRangeChange={setRange}
          rowCount={rowCount}
          note={note}
          buildReport={() => buildReport(range, filters)}
          filters={filters}
        />
        <p className="small muted" style={{ margin: "14px 2px 2px" }}>
          {t("report.note")}
        </p>
      </Sheet>
    </>
  );
}
