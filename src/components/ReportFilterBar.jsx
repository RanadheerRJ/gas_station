import { memo, useCallback } from "react";
import { Chip, ChipRow } from "./Chip.jsx";
import { Field } from "./ui.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/** The four fuel choices every forecourt report scopes by. */
const FUELS = ["ALL", "MS", "HSD", "CNG"];

/**
 * The statuses a shift can be in, in the order the review workflow moves
 * through them. The value is what the database stores; the key is the copy.
 */
const STATUSES = [
  ["ALL", "report.allStatuses"],
  ["open", "report.statusOpen"],
  ["pending_review", "shifts.pendingReview"],
  ["approved", "shifts.approved"],
  ["rejected", "shifts.sentBack"],
];

/**
 * Which filters make sense for which report — the employee is meaningless on
 * a stock report, and status only exists on shifts.
 *
 * Spelling it out here keeps a control off the screen where it would do
 * nothing, rather than showing it and quietly ignoring the choice.
 */
const FILTERS = {
  ledger: { fuel: true },
  shifts: { fuel: true, employee: true, status: true },
  monthly: { fuel: true, employee: true },
  stock: { fuel: true },
};

/** Human names for reports the map above does not list (credit, statement). */
export function reportFilters(report) {
  return FILTERS[report] || { fuel: false, employee: false, status: false };
}

/**
 * The scope row of the export sheet: which fuel, whose shifts, what status.
 *
 * Fuel is a row of chips because it is four choices and a thumb can hit all
 * four; the two lists that can grow past a screenful (staff, statuses) are
 * selects. Every control here narrows the same rows the summary card has
 * already counted, so choosing a fuel changes the row count on the spot.
 *
 * The staff list is roster data, so the employee picker only appears for the
 * roles that may read it (`canScopeEmployee`); an attendant exports their own
 * shifts without being shown a control with one option in it.
 *
 * Memoized: report filters sit inside a sheet that re-renders as the date
 * range changes; memo keeps the chip row from re-rendering when only dates changed.
 */
function ReportFilterBar({
  report,
  fuelGroup = "ALL",
  onFuelGroup,
  employeeId = "",
  onEmployee,
  status = "ALL",
  onStatus,
  staff = [],
  canScopeEmployee = false,
  idPrefix = "report",
}) {
  const { t } = useLanguage();
  const scope = reportFilters(report);
  const showEmployee = scope.employee && canScopeEmployee;
  const handleFuel = useCallback((v) => () => onFuelGroup?.(v), [onFuelGroup]);
  const handleEmployee = useCallback((e) => onEmployee?.(e.target.value), [onEmployee]);
  const handleStatus = useCallback((e) => onStatus?.(e.target.value), [onStatus]);

  if (!scope.fuel && !showEmployee && !scope.status) return null;

  return (
    <div className="report-filters">
      {scope.fuel && (
        <div className="report-filters__group" role="group" aria-label={t("report.fuel")}>
          <span className="report-filters__label">{t("report.fuel")}</span>
          <ChipRow label={t("report.fuel")}>
            {FUELS.map((value) => (
              <Chip
                key={value}
                label={value === "ALL" ? t("report.allFuels") : value}
                selected={fuelGroup === value}
                onClick={handleFuel(value)}
              />
            ))}
          </ChipRow>
        </div>
      )}

      {showEmployee && (
        <Field label={t("report.employee")}>
          <select
            id={`${idPrefix}-employee`}
            value={employeeId}
            onChange={handleEmployee}
          >
            <option value="">{t("report.allEmployees")}</option>
            {staff.map((member) => (
              <option key={member.uid} value={member.uid}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {scope.status && (
        <Field label={t("report.status")}>
          <select id={`${idPrefix}-status`} value={status} onChange={handleStatus}>
            {STATUSES.map(([value, key]) => (
              <option key={value} value={value}>
                {t(key)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

export default memo(ReportFilterBar);
