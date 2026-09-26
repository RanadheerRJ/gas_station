import { Fragment } from "react";
import { Empty, Notice } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

const SECTION_LABEL = {
  fontWeight: 600,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

/**
 * One owner, and — when expanded — the stations they hold and the logins
 * underneath them. A missing station registry shows as an em dash rather
 * than a zero: "we could not ask" is not the same as "none".
 */
export default function OwnerRow({
  owner,
  owned,
  expanded,
  entry,
  stationsFor,
  onToggleStaff,
  onResetPin,
  onResetStation,
}) {
  const { t } = useLanguage();
  return (
    <Fragment>
      <tr>
        <td data-label={t("admin.owner")} style={{ fontWeight: 500 }}>
          {owner.name}
        </td>
        <td data-label={t("staff.username")} className="mono">
          {owner.username}
        </td>
        <td data-label={t("common.phone")} className="mono small">
          {owner.phone}
        </td>
        <td data-label={t("admin.stations")}>
          {owned === null ? (
            <span className="muted">—</span>
          ) : (
            <>
              <div className="num mono">{owned.length}</div>
              {owned.length > 0 && (
                <div className="small muted" title={owned.map((s) => s.name).join(", ")}>
                  {owned.map((s) => s.name).join(", ")}
                </div>
              )}
            </>
          )}
        </td>
        <td data-label={t("common.actions")} className="num">
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="quiet" onClick={() => onToggleStaff(owner)}>
              {expanded ? t("admin.hideStaff") : t("admin.showStaff")}
            </button>
            <button type="button" className="quiet" onClick={() => onResetPin(owner)}>
              {t("staff.resetPin")}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="responsive-table__detail-row">
          <td
            className="responsive-table__detail-cell"
            colSpan={5}
            style={{ background: "var(--surface-sunken)" }}
          >
            <div className="nested-panel stack" style={{ gap: 16 }}>
              {owned && owned.length > 0 && (
                <div>
                  <div className="small muted" style={SECTION_LABEL}>
                    {t("admin.stations")}
                  </div>
                  <table className="responsive-table">
                    <thead>
                      <tr>
                        <th>{t("common.station")}</th>
                        <th>{t("owner.address")}</th>
                        <th>{t("common.status")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {owned.map((s) => (
                        <tr key={s.stationId}>
                          <td
                            data-label={t("common.station")}
                            style={{ fontWeight: 500 }}
                          >
                            {s.name}
                          </td>
                          <td data-label={t("owner.address")} className="small muted">
                            {s.address}
                          </td>
                          <td data-label={t("common.status")}>
                            <span
                              className={`tag ${s.state === "active" ? "green" : ""}`}
                            >
                              {s.state === "active"
                                ? t("setup.active")
                                : t("owner.archived")}
                            </span>
                          </td>
                          <td data-label={t("common.actions")} className="num">
                            <button
                              type="button"
                              className="quiet danger"
                              onClick={() =>
                                onResetStation({ id: s.stationId, name: s.name })
                              }
                            >
                              {t("station.resetShort")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <div className="small muted" style={SECTION_LABEL}>
                  {t("admin.showStaff")}
                </div>
                {!entry ? (
                  <div className="small muted">{t("admin.loadingStaff")}</div>
                ) : entry.error ? (
                  <Notice kind="error">{entry.error}</Notice>
                ) : entry.rows.length === 0 ? (
                  <Empty>{t("admin.noStaff")}</Empty>
                ) : (
                  <table className="responsive-table">
                    <thead>
                      <tr>
                        <th>{t("common.name")}</th>
                        <th>{t("staff.username")}</th>
                        <th>{t("staff.role")}</th>
                        <th>{t("common.station")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {entry.rows.map((member) => (
                        <tr key={member.uid}>
                          <td data-label={t("common.name")} style={{ fontWeight: 500 }}>
                            {member.name}
                          </td>
                          <td data-label={t("staff.username")} className="mono">
                            {member.username}
                          </td>
                          <td data-label={t("staff.role")}>{t(`role.${member.role}`)}</td>
                          <td data-label={t("common.station")} className="small muted">
                            {stationsFor(owner.uid)?.find(
                              (s) => s.stationId === member.stationIds[0]
                            )?.name || "—"}
                          </td>
                          <td data-label={t("common.actions")} className="num">
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => onResetPin(member)}
                            >
                              {t("staff.resetPin")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
