import { useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { Notice } from "../components/ui.jsx";
import { useAuth } from "../state/AuthContext";
import ResetPinPanel from "../components/ResetPinPanel.jsx";
import Sheet from "../components/Sheet.jsx";
import { listStaff, readableError } from "../lib/api";
import { formatStamp } from "../lib/format";
import { Chip, ChipRow } from "../components/Chip.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ListRow from "../components/ListRow.jsx";
import { PeopleIcon } from "../components/icons.jsx";
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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected] = useState(null);

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
          <Skeleton shape="row" count={3} />
        ) : staff.length === 0 ? (
          <EmptyState icon={PeopleIcon} headline={t("team.none")} />
        ) : (
          <>
            <input
              type="search"
              className="shifts-search"
              aria-label={t("staff.searchStaff")}
              placeholder={t("staff.searchStaff")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ChipRow label={t("staff.role")}>
              {[
                ["all", t("staff.allRoles")],
                ["manager", t("role.manager")],
                ["attendant", t("role.attendant")],
              ].map(([id, label]) => (
                <Chip
                  key={id}
                  label={label}
                  count={
                    id === "all"
                      ? staff.length
                      : staff.filter((m) => m.role === id).length
                  }
                  selected={roleFilter === id}
                  onClick={() => setRoleFilter(id)}
                />
              ))}
            </ChipRow>
            <section className="card">
              {staff
                .filter(
                  (m) =>
                    (roleFilter === "all" || m.role === roleFilter) &&
                    (!search.trim() ||
                      `${m.name} ${m.phone} ${m.username}`
                        .toLowerCase()
                        .includes(search.trim().toLowerCase()))
                )
                .map((member) => (
                  <ListRow
                    key={member.uid}
                    avatar={member.name}
                    title={
                      member.uid === profile.uid
                        ? `${member.name} (${t("team.you")})`
                        : member.name
                    }
                    subtitle={`${t(`role.${member.role}`)} · ${member.phone || ""}`}
                    trailing={
                      <span className="small muted">{formatStamp(member.createdAt)}</span>
                    }
                    onClick={() => member.uid !== profile.uid && setSelected(member)}
                  />
                ))}
            </section>
          </>
        )}
      </div>

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name || ""}
      >
        {selected && (
          <div className="stack">
            <p className="small muted">
              {t(`role.${selected.role}`)} · {selected.phone || ""} · @{selected.username}
            </p>
            <button
              type="button"
              className="cta"
              onClick={() => {
                setResetting(selected);
                setSelected(null);
              }}
            >
              {t("staff.resetPin")}
            </button>
          </div>
        )}
      </Sheet>

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
