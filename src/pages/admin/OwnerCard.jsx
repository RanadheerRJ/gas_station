import { Empty, Notice } from "../../components/ui";
import { PencilIcon, PlusIcon, TrashIcon } from "../../components/icons.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** The first letter of a name, for the card's initial badge. */
function initial(name) {
  return String(name || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
}

/**
 * One owner: who they are, what they hold, and every action that can be
 * taken on the account — correct it, reset its PIN, give it another station,
 * or remove it.
 *
 * A missing station registry shows as an em dash rather than a zero: "we
 * could not ask" is not the same as "none". Expanding the card is what
 * fetches the logins beneath the owner, so the console does not pull every
 * roster on every load.
 */
export default function OwnerCard({
  owner,
  owned,
  expanded,
  entry,
  onToggleStaff,
  onResetPin,
  onEditAccount,
  onDeleteAccount,
  onAddStation,
  onManageStation,
}) {
  const { t } = useLanguage();
  const stationCount = owned === null ? null : owned.length;

  return (
    <article className={`dev-card${expanded ? " dev-card--open" : ""}`}>
      <div className="dev-card__head">
        <span className="dev-card__badge" aria-hidden="true">
          {initial(owner.name)}
        </span>
        <div className="dev-card__ident">
          <h3>{owner.name}</h3>
          <div className="small muted">
            <span className="mono">{owner.username}</span>
            {owner.phone ? <> · {owner.phone}</> : null}
          </div>
        </div>
        <span className="tag">
          {stationCount === null
            ? t("admin.stationsUnknown")
            : t(stationCount === 1 ? "admin.stationCountOne" : "admin.stationCountMany", {
                count: stationCount,
              })}
        </span>
      </div>

      <div className="dev-card__actions">
        <button type="button" className="quiet" onClick={() => onToggleStaff(owner)}>
          {expanded ? t("admin.hideDetail") : t("admin.showDetail")}
        </button>
        <button type="button" className="quiet" onClick={() => onEditAccount(owner)}>
          {t("common.edit")}
        </button>
        <button type="button" className="quiet" onClick={() => onResetPin(owner)}>
          {t("staff.resetPin")}
        </button>
        <button type="button" className="quiet" onClick={() => onAddStation(owner.uid)}>
          {t("owner.addStation")}
        </button>
        <button
          type="button"
          className="quiet danger-link"
          onClick={() => onDeleteAccount(owner)}
        >
          {t("admin.deleteOwner")}
        </button>
      </div>

      {expanded && (
        <div className="dev-card__detail">
          <section>
            <div className="dev-subhead">
              <span>{t("admin.stations")}</span>
              <button
                type="button"
                className="quiet"
                onClick={() => onAddStation(owner.uid)}
              >
                <PlusIcon size={13} />
                {t("owner.addStation")}
              </button>
            </div>
            {owned === null ? (
              <Notice>{t("admin.registryMissing")}</Notice>
            ) : owned.length === 0 ? (
              <Empty>{t("owner.noStations")}</Empty>
            ) : (
              <ul className="dev-mini-list">
                {owned.map((station) => (
                  <li key={station.stationId} className="dev-mini">
                    <div className="dev-mini__main">
                      <b>{station.name}</b>
                      <span className="small muted">{station.address}</span>
                    </div>
                    <span className={`tag ${station.state === "active" ? "green" : ""}`}>
                      {station.state === "active"
                        ? t("setup.active")
                        : t("owner.archived")}
                    </span>
                    <button
                      type="button"
                      className="small"
                      onClick={() => onManageStation(station)}
                    >
                      {t("admin.manage")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="dev-subhead">
              <span>{t("admin.logins")}</span>
            </div>
            {!entry ? (
              <div className="small muted">{t("admin.loadingStaff")}</div>
            ) : entry.error ? (
              <Notice kind="error">{entry.error}</Notice>
            ) : entry.rows.length === 0 ? (
              <Empty>{t("admin.noStaff")}</Empty>
            ) : (
              <ul className="dev-mini-list">
                {entry.rows.map((member) => (
                  <li key={member.uid} className="dev-mini">
                    <div className="dev-mini__main">
                      <b>{member.name}</b>
                      <span className="small muted">
                        <span className="mono">{member.username}</span> ·{" "}
                        {(owned || []).find(
                          (station) => station.stationId === member.stationIds[0]
                        )?.name || "—"}
                      </span>
                    </div>
                    <span className="tag">{t(`role.${member.role}`)}</span>
                    <div className="dev-mini__actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("common.edit")}
                        title={t("common.edit")}
                        onClick={() => onEditAccount(member)}
                      >
                        <PencilIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="small"
                        onClick={() => onResetPin(member)}
                      >
                        {t("staff.resetPin")}
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        aria-label={t("admin.deleteLogin")}
                        title={t("admin.deleteLogin")}
                        onClick={() => onDeleteAccount(member)}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
