import { Panel } from "../../components/ui";
import { TrashIcon } from "../../components/icons";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Wiping a station's operational data: kept apart, and clearly marked. */
export default function DangerZonePanel({ station, busy, onReset }) {
  const { t } = useLanguage();
  return (
    <Panel
      title={
        <span
          className="row"
          style={{ gap: 7, alignItems: "center", color: "var(--rust)" }}
        >
          <TrashIcon size={16} /> {t("station.resetDangerZone")}
        </span>
      }
      note={t("station.resetDangerNote")}
    >
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 500 }}>{t("station.resetData")}</div>
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
