import { useLanguage } from "../state/LanguageContext.jsx";

export default function ReportFilterBar({
  report,
  fuelGroup,
  onFuelGroup,
  employeeId,
  onEmployee,
  status,
  onStatus,
  staff = [],
}) {
  const { t } = useLanguage();
  const fuel = ["ALL", "MS", "HSD", "CNG"];
  const hasFuel = ["ledger", "shifts", "stock", "monthly"].includes(report);
  const hasEmployee = ["shifts", "monthly"].includes(report);
  return (
    <div className="report-filter-bar">
      {hasFuel && (
        <fieldset>
          <legend>{t("report.fuel")}</legend>
          <div className="segmented-control">
            {fuel.map((value) => (
              <button
                type="button"
                key={value}
                className={fuelGroup === value ? "active" : ""}
                onClick={() => onFuelGroup(value)}
              >
                {value === "ALL" ? t("report.allFuels") : value}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {hasEmployee && (
        <label className="field">
          <span>{t("report.employee")}</span>
          <select value={employeeId} onChange={(e) => onEmployee(e.target.value)}>
            <option value="">{t("report.allEmployees")}</option>
            {staff.map((member) => (
              <option key={member.uid} value={member.uid}>
                {member.name} ({t(`role.${member.role}`)})
              </option>
            ))}
          </select>
        </label>
      )}
      {report === "shifts" && (
        <label className="field">
          <span>{t("report.status")}</span>
          <select value={status} onChange={(e) => onStatus(e.target.value)}>
            <option value="ALL">{t("report.allStatuses")}</option>
            <option value="open">Open</option>
            <option value="pending_review">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      )}
    </div>
  );
}
