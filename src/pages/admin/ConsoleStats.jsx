import { Stat } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** The console's day at a glance. */
export default function ConsoleStats({
  owners,
  loadingOwners,
  registry,
  activeStations,
}) {
  const { t } = useLanguage();
  return (
    <section className="card stat-strip stat-strip--hero">
      <Stat
        label={t("admin.statOwners")}
        value={loadingOwners ? "—" : String(owners.length)}
      />
      <Stat
        label={t("admin.statStations")}
        value={registry === null ? "—" : String(registry.length)}
      />
      <Stat
        label={t("admin.statActive")}
        value={activeStations === null ? "—" : String(activeStations)}
        tone={activeStations ? "pos" : undefined}
      />
      <Stat
        label={t("admin.statArchived")}
        value={registry === null ? "—" : String(registry.length - activeStations)}
      />
    </section>
  );
}
