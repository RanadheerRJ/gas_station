import { Empty, Panel } from "../../components/ui";
import { PumpIcon } from "../../components/icons";
import { LoadingPanels } from "../../components/motion.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import PumpCard from "./PumpCard.jsx";

/** Every pump at the station. Adding a pump lives in the screen's single sheet. */
export default function EquipmentPanel({
  loading,
  pumps,
  nozzles,
  tanks,
  active,
  busy,
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
