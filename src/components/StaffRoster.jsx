import { useMemo, useState } from "react";
import { Chip, ChipRow } from "./Chip.jsx";
import EmptyState from "./EmptyState.jsx";
import ListRow from "./ListRow.jsx";
import ResetPinPanel from "./ResetPinPanel.jsx";
import Sheet from "./Sheet.jsx";
import Skeleton from "./Skeleton.jsx";
import { PeopleIcon } from "./icons.jsx";
import { formatStamp } from "../lib/format.js";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The staff directory shared by owners and managers.
 *
 * Searching, role filtering, member details and the reset-PIN flow are the
 * same for both roles. The surrounding page keeps its own permissions and
 * actions: owners can create logins, while managers only get this directory.
 */
export default function StaffRoster({
  staff,
  loading,
  emptyHeadline,
  currentUserId,
  stationName,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [resetting, setResetting] = useState(null);

  const visibleStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return staff.filter(
      (member) =>
        (roleFilter === "all" || member.role === roleFilter) &&
        (!query ||
          `${member.name} ${member.phone} ${member.username}`
            .toLowerCase()
            .includes(query))
    );
  }, [roleFilter, search, staff]);

  return (
    <>
      {loading ? (
        <Skeleton shape="row" count={3} />
      ) : staff.length === 0 ? (
        <EmptyState icon={PeopleIcon} headline={emptyHeadline} />
      ) : (
        <>
          <input
            type="search"
            className="shifts-search"
            aria-label={t("staff.searchStaff")}
            placeholder={t("staff.searchStaff")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
                    : staff.filter((member) => member.role === id).length
                }
                selected={roleFilter === id}
                onClick={() => setRoleFilter(id)}
              />
            ))}
          </ChipRow>
          <section className="card">
            {visibleStaff.map((member) => {
              const isCurrentUser = member.uid === currentUserId;
              const station = stationName?.((member.stationIds || [])[0]);
              return (
                <ListRow
                  key={member.uid}
                  avatar={member.name}
                  title={
                    isCurrentUser ? `${member.name} (${t("team.you")})` : member.name
                  }
                  subtitle={[t(`role.${member.role}`), station, member.phone || ""]
                    .filter((part) => part !== undefined)
                    .join(" · ")}
                  trailing={
                    <span className="small muted">{formatStamp(member.createdAt)}</span>
                  }
                  onClick={() => {
                    if (!isCurrentUser) setSelected(member);
                  }}
                />
              );
            })}
          </section>
        </>
      )}

      <Sheet
        open={Boolean(selected)}
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

      <Sheet
        open={Boolean(resetting)}
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
