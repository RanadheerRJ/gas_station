import { ScreenHeader } from "../components/Layout.jsx";
import { Notice } from "../components/ui";
import StationFilter from "../components/StationFilter";
import ResetStationSheet from "../components/ResetStationSheet.jsx";
import { LoadingPanels } from "../components/motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";
import { useStationSetup } from "./setup/useStationSetup.js";
import PricesPanel from "./setup/PricesPanel.jsx";
import EquipmentPanel from "./setup/EquipmentPanel.jsx";
import ReadingsFlowPanel from "./setup/ReadingsFlowPanel.jsx";
import DangerZonePanel from "./setup/DangerZonePanel.jsx";

/**
 * Everything a station is made of: what it sells and for how much, and the
 * pumps and nozzles it sells it through. The figures typed here are the ones
 * every later screen derives from, so the panels stay deliberately plain.
 */
export default function StationSetup() {
  const { t, tn } = useLanguage();
  const {
    stations,
    station,
    stationId,
    setStation,
    stationsLoading,
    pumps,
    nozzles,
    tanks,
    priceRecords,
    loading,
    error,
    busy,
    pumpName,
    setPumpName,
    nozzleFor,
    nozzleForm,
    setNozzleForm,
    rateDraft,
    setRateDraft,
    resetting,
    setResetting,
    activeFuels,
    active,
    load,
    updatePrice,
    submitPump,
    toggleNozzleForm,
    submitNozzle,
    togglePumpState,
    toggleNozzleState,
    assignTank,
  } = useStationSetup();

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("setup.shortTitle")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("setup.title")}
        sub={
          station
            ? `${station.name} · ${tn(nozzles.length, "setup.nozzleCountOne", "setup.nozzleCount")}`
            : ""
        }
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        <PricesPanel
          activeFuels={activeFuels}
          active={active}
          priceRecords={priceRecords}
          rateDraft={rateDraft}
          setRateDraft={setRateDraft}
          busy={busy}
          onUpdatePrice={updatePrice}
        />

        <EquipmentPanel
          loading={loading}
          pumps={pumps}
          nozzles={nozzles}
          tanks={tanks}
          active={active}
          busy={busy}
          pumpName={pumpName}
          setPumpName={setPumpName}
          onSubmitPump={submitPump}
          nozzleFor={nozzleFor}
          nozzleForm={nozzleForm}
          setNozzleForm={setNozzleForm}
          onToggleNozzleForm={toggleNozzleForm}
          onSubmitNozzle={submitNozzle}
          onTogglePumpState={togglePumpState}
          onToggleNozzleState={toggleNozzleState}
          onAssignTank={assignTank}
        />

        <ReadingsFlowPanel />

        <DangerZonePanel
          station={station}
          busy={busy}
          onReset={() => setResetting(station)}
        />
      </div>

      <ResetStationSheet
        open={!!resetting}
        station={resetting}
        onClose={() => setResetting(null)}
        onDone={() => load()}
      />
    </>
  );
}
