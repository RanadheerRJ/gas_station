import { Empty, Panel } from "../../components/ui";
import { LoadingPanels } from "../../components/motion.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import OwnerRow from "./OwnerRow.jsx";

/** Every owner account this console has created. */
export default function OwnerAccountsPanel({
  owners,
  loadingOwners,
  staffOpen,
  staff,
  stationsFor,
  onToggleStaff,
  onResetPin,
  onResetStation,
}) {
  const { t } = useLanguage();
  return (
    <Panel title={t("admin.ownerAccounts")} flush>
      {loadingOwners ? (
        <LoadingPanels count={2} lines={2} label={t("common.loading")} />
      ) : owners.length === 0 ? (
        <Empty>{t("admin.noOwners")}</Empty>
      ) : (
        <table className="responsive-table">
          <thead>
            <tr>
              <th>{t("admin.owner")}</th>
              <th>{t("staff.username")}</th>
              <th>{t("common.phone")}</th>
              <th className="num">{t("admin.stations")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <OwnerRow
                key={o.uid}
                owner={o}
                owned={stationsFor(o.uid)}
                expanded={staffOpen === o.uid}
                entry={staff[o.uid]}
                stationsFor={stationsFor}
                onToggleStaff={onToggleStaff}
                onResetPin={onResetPin}
                onResetStation={onResetStation}
              />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
