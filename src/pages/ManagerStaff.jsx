import { useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { Notice } from "../components/ui.jsx";
import { useAuth } from "../state/AuthContext";
import ResetPinPanel from "../components/ResetPinPanel.jsx";
import Sheet from "../components/Sheet.jsx";
import { listStaff, readableError } from "../lib/api";
import { formatStamp } from "../lib/format";
import { LoadingPanels } from "../components/motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Team & access (the manager's "More"): the roster of the manager's own
 * station, and the one write action a manager has over it — resetting a
 * colleague's forgotten PIN. Issuing new logins stays with the owner.
 */
export default function ManagerStaff() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setStaff(await listStaff(profile));
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <ScreenHeader title={t("team.title")} sub={t("team.subtitle")} />
      <div className="content stack">
        <Notice>{t("team.note")}</Notice>
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        ) : staff.length === 0 ? (
          <div className="empty-card">
            <h2>{t("team.none")}</h2>
          </div>
        ) : (
          <section className="card card--flush">
            <div className="card__head">
              <h2>{t("staff.existing")}</h2>
            </div>
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("staff.username")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("staff.role")}</th>
                  <th>{t("staff.created")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const self = member.uid === profile.uid;
                  return (
                    <tr key={member.uid}>
                      <td data-label={t("common.name")} style={{ fontWeight: 500 }}>
                        {member.name}
                        {self && (
                          <span className="tag" style={{ marginLeft: 8 }}>
                            {t("team.you")}
                          </span>
                        )}
                      </td>
                      <td data-label={t("staff.username")} className="mono">
                        {member.username}
                      </td>
                      <td data-label={t("common.phone")} className="mono small">
                        {member.phone}
                      </td>
                      <td data-label={t("staff.role")}>{t(`role.${member.role}`)}</td>
                      <td data-label={t("staff.created")} className="small muted">
                        {formatStamp(member.createdAt)}
                      </td>
                      <td data-label={t("common.actions")} className="num">
                        {/* Your own PIN is changed from the account panel —
                            with the current PIN, not over it. */}
                        {!self && (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setResetting(member)}
                          >
                            {t("staff.resetPin")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* ---- reset a colleague's PIN ---- */}
      <Sheet
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={t("cred.settingFor", { name: resetting?.name || "" })}
      >
        {resetting && (
          <ResetPinPanel target={resetting} onDone={() => setResetting(null)} />
        )}
      </Sheet>
    </>
  );
}
