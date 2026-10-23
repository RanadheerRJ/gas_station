import { useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import StaffRoster from "../components/StaffRoster.jsx";
import { Notice } from "../components/ui.jsx";
import { useAuth } from "../state/AuthContext";
import { listStaff, readableError } from "../lib/api";
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

        <StaffRoster
          staff={staff}
          loading={loading}
          emptyHeadline={t("team.none")}
          currentUserId={profile?.uid}
        />
      </div>
    </>
  );
}
