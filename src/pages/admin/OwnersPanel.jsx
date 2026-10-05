import { useMemo, useState } from "react";
import { Panel } from "../../components/ui";
import { LoadingPanels } from "../../components/motion.jsx";
import { PlusIcon } from "../../components/icons.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import OwnerCard from "./OwnerCard.jsx";

/** Matches an owner on anything a support call is likely to quote. */
function matches(owner, query) {
  if (!query) return true;
  return `${owner.name} ${owner.username} ${owner.phone}`.toLowerCase().includes(query);
}

/**
 * Every owner account this console has created, one card each, with their
 * stations and logins a tap away. The search box is here rather than in the
 * header because it belongs to this list alone — the stations tab has its
 * own.
 */
export default function OwnersPanel({
  owners,
  loadingOwners,
  staffOpen,
  staff,
  stationsFor,
  onToggleStaff,
  onResetPin,
  onEditAccount,
  onDeleteAccount,
  onAddStation,
  onManageStation,
  onNewOwner,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () => owners.filter((owner) => matches(owner, query)),
    [owners, query]
  );

  return (
    <Panel
      title={t("admin.ownerAccounts")}
      note={t("admin.ownerAccountsNote")}
      actions={
        <button type="button" className="tool-btn" onClick={onNewOwner}>
          <PlusIcon size={15} />
          {t("admin.newOwner")}
        </button>
      }
    >
      {loadingOwners ? (
        <LoadingPanels count={2} lines={2} label={t("common.loading")} />
      ) : owners.length === 0 ? (
        <div className="dev-empty">
          <h3>{t("admin.noOwners")}</h3>
          <p className="small muted">{t("admin.noOwnersHint")}</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="dev-toolbar">
            <input
              type="search"
              aria-label={t("admin.searchOwners")}
              placeholder={t("admin.searchOwners")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="small muted dev-toolbar__count">
              {t("admin.showingCount", {
                shown: visible.length,
                total: owners.length,
              })}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="dev-empty">
              <h3>{t("admin.noMatches")}</h3>
            </div>
          ) : (
            <div className="dev-list">
              {visible.map((owner) => (
                <OwnerCard
                  key={owner.uid}
                  owner={owner}
                  owned={stationsFor(owner.uid)}
                  expanded={staffOpen === owner.uid}
                  entry={staff[owner.uid]}
                  onToggleStaff={onToggleStaff}
                  onResetPin={onResetPin}
                  onEditAccount={onEditAccount}
                  onDeleteAccount={onDeleteAccount}
                  onAddStation={onAddStation}
                  onManageStation={onManageStation}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
