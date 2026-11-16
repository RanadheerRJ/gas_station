import { Panel } from "../../components/ui";
import { TrashIcon } from "../../components/icons";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Wiping a station's operational data: kept apart, and clearly marked. */
export default function DangerZonePanel({ station, busy, onReset }) {
  const { t } = useLanguage();
  return (
    <Panel
      className="danger-zone"
      title={
        <span className="inline-icon-label danger-zone__title">
          <TrashIcon size={16} /> {t("station.resetDangerZone")}
        </span>
      }
      note={t("station.resetDangerNote")}
    >
      <div className="between danger-zone__row">
        <div>
          <div className="danger-zone__label">{t("station.resetData")}</div>
          <div className="small muted">{t("station.resetWarningShort")}</div>
        </div>
        <button
          type="button"
          className="danger"
          disabled={busy || !station}
          onClick={onReset}
        >
          {t("station.resetData")}
        </button>
      </div>
    </Panel>
  );
}
