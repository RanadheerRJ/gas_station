import { useMemo, useState } from "react";
import { Notice, Panel } from "../../components/ui";
import { LoadingPanels } from "../../components/motion.jsx";
import { PlusIcon } from "../../components/icons.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

const FILTERS = [
  ["all", "admin.filterAll"],
  ["active", "admin.filterActive"],
  ["archived", "admin.filterArchived"],
];

/**
 * Every station on the platform, whoever owns it.
 *
 * A null registry means the lookup itself failed, so the panel says so
 * instead of claiming there are none. Each row opens the same station sheet
 * that creating one does, which is where renaming, transferring, archiving,
 * resetting, and deleting all live — one place to learn, not five.
 */
export default function StationsPanel({
  registry,
  loading,
  onManage,
  onNewStation,
  canCreate,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!registry) return [];
    return registry.filter((station) => {
      const inFilter =
        filter === "all" ||
        (filter === "active" && station.state === "active") ||
        (filter === "archived" && station.state !== "active");
      const haystack =
        `${station.name} ${station.ownerName} ${station.address}`.toLowerCase();
      return inFilter && (!query || haystack.includes(query));
    });
  }, [registry, filter, query]);

  return (
    <Panel
      title={t("admin.stationsList")}
      note={t("admin.stationsListNote")}
      actions={
        canCreate ? (
          <button type="button" className="tool-btn" onClick={onNewStation}>
            <PlusIcon size={15} />
            {t("admin.newStation")}
          </button>
        ) : null
      }
    >
      {loading ? (
        <LoadingPanels count={2} lines={2} label={t("common.loading")} />
      ) : registry === null ? (
        <Notice>{t("admin.registryMissing")}</Notice>
      ) : registry.length === 0 ? (
        <div className="dev-empty">
          <h3>{t("owner.noStations")}</h3>
          <p className="small muted">
            {canCreate ? t("admin.noStationsHint") : t("admin.noOwnersHint")}
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="dev-toolbar">
            <input
              type="search"
              aria-label={t("admin.searchStations")}
              placeholder={t("admin.searchStations")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="dev-chips">
              {FILTERS.map(([id, key]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <span className="small muted dev-toolbar__count">
              {t("admin.showingCount", {
                shown: visible.length,
                total: registry.length,
              })}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="dev-empty">
              <h3>{t("admin.noMatches")}</h3>
            </div>
          ) : (
            <table className="responsive-table dev-table">
              <thead>
                <tr>
                  <th>{t("common.station")}</th>
                  <th>{t("admin.owner")}</th>
                  <th className="num">{t("admin.logins")}</th>
                  <th>{t("common.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((station) => (
                  <tr key={station.stationId}>
                    <td data-label={t("common.station")}>
                      <b>{station.name}</b>
                      <div className="small muted">{station.address}</div>
                    </td>
                    <td data-label={t("admin.owner")}>
                      {station.ownerName}
                      {station.ownerUsername && (
                        <div className="small muted mono">{station.ownerUsername}</div>
                      )}
                    </td>
                    <td data-label={t("admin.logins")} className="num mono">
                      {station.staffCount ?? 0}
                    </td>
                    <td data-label={t("common.status")}>
                      <span
                        className={`tag ${station.state === "active" ? "green" : ""}`}
                      >
                        {station.state === "active"
                          ? t("setup.active")
                          : t("owner.archived")}
                      </span>
                    </td>
                    <td data-label={t("common.actions")} className="num">
                      <button type="button" onClick={() => onManage(station)}>
                        {t("admin.manage")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Panel>
  );
}
