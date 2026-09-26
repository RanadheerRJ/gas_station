import { Empty, Notice, Panel } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Every station on the platform, whoever owns it. A null registry means the
 * lookup itself failed, so the panel says so instead of claiming there are
 * none.
 */
export default function StationRegistryPanel({ registry, onResetStation }) {
  const { t } = useLanguage();
  return (
    <Panel title={t("admin.stationsList")} flush>
      {registry === null ? (
        <Notice>{t("admin.registryMissing")}</Notice>
      ) : registry.length === 0 ? (
        <Empty>{t("owner.noStations")}</Empty>
      ) : (
        <table className="responsive-table">
          <thead>
            <tr>
              <th>{t("common.station")}</th>
              <th>{t("admin.owner")}</th>
              <th>{t("owner.address")}</th>
              <th>{t("common.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {registry.map((st) => (
              <tr key={st.stationId}>
                <td data-label={t("common.station")} style={{ fontWeight: 500 }}>
                  {st.name}
                </td>
                <td data-label={t("admin.owner")}>{st.ownerName}</td>
                <td data-label={t("owner.address")} className="small muted">
                  {st.address}
                </td>
                <td data-label={t("common.status")}>
                  <span className={`tag ${st.state === "active" ? "green" : ""}`}>
                    {st.state === "active" ? t("setup.active") : t("owner.archived")}
                  </span>
                </td>
                <td data-label={t("common.actions")} className="num">
                  <button
                    type="button"
                    className="quiet danger"
                    onClick={() => onResetStation({ id: st.stationId, name: st.name })}
                  >
                    {t("station.resetShort")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
