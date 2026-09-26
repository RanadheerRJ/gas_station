import { Empty, Field, Panel } from "../../components/ui";
import { PumpIcon } from "../../components/icons";
import { LoadingPanels } from "../../components/motion.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import PumpCard from "./PumpCard.jsx";

/** Every pump at the station, plus the one field that adds another. */
export default function EquipmentPanel({
  loading,
  pumps,
  nozzles,
  tanks,
  active,
  busy,
  pumpName,
  setPumpName,
  onSubmitPump,
  nozzleFor,
  nozzleForm,
  setNozzleForm,
  onToggleNozzleForm,
  onSubmitNozzle,
  onTogglePumpState,
  onToggleNozzleState,
  onAssignTank,
}) {
  const { t } = useLanguage();
  return (
    <Panel
      title={
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <PumpIcon /> {t("setup.pumpsNozzles")}
        </span>
      }
      flush
    >
      <div className="body" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <Field label={t("setup.addAPump")}>
            <input
              value={pumpName}
              onChange={(e) => setPumpName(e.target.value)}
              placeholder="Pump 3"
              style={{ width: 200 }}
            />
          </Field>
          <button
            type="button"
            disabled={busy || !pumpName.trim()}
            onClick={onSubmitPump}
          >
            {t("setup.addPump")}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingPanels count={2} lines={3} label={t("common.loading")} />
      ) : pumps.length === 0 ? (
        <Empty>{t("setup.noPumps")}</Empty>
      ) : (
        <div>
          {pumps.map((p) => (
            <PumpCard
              key={p.id}
              pump={p}
              nozzles={nozzles}
              tanks={tanks}
              active={active}
              busy={busy}
              nozzleFor={nozzleFor}
              nozzleForm={nozzleForm}
              setNozzleForm={setNozzleForm}
              onToggleNozzleForm={onToggleNozzleForm}
              onSubmitNozzle={onSubmitNozzle}
              onTogglePumpState={onTogglePumpState}
              onToggleNozzleState={onToggleNozzleState}
              onAssignTank={onAssignTank}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
