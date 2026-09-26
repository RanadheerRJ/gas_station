import { ScreenHeader } from "../components/Layout.jsx";
import { CredentialPanel, Notice, Panel } from "../components/ui";
import ResetPinPanel from "../components/ResetPinPanel";
import ResetStationSheet from "../components/ResetStationSheet.jsx";
import Sheet from "../components/Sheet.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";
import { useAdminConsole } from "./admin/useAdminConsole.js";
import ConsoleStats from "./admin/ConsoleStats.jsx";
import NewOwnerForm from "./admin/NewOwnerForm.jsx";
import OwnerAccountsPanel from "./admin/OwnerAccountsPanel.jsx";
import StationRegistryPanel from "./admin/StationRegistryPanel.jsx";
import HowItWorksPanel from "./admin/HowItWorksPanel.jsx";

/**
 * The developer console: create an owner, see who exists, and reset a PIN or
 * a station's data when something has to be undone. Nothing here belongs to a
 * station's day-to-day, so it stays deliberately separate from the rest of
 * the app.
 */
export default function AdminInviteOwner() {
  const { t } = useLanguage();
  const {
    form,
    setForm,
    set,
    busy,
    error,
    credentials,
    setCredentials,
    owners,
    loadingOwners,
    registry,
    staffOpen,
    staff,
    resetting,
    setResetting,
    resettingStation,
    setResettingStation,
    loadOwners,
    stationsFor,
    toggleStaff,
    submit,
    phoneKey,
    complete,
    activeStations,
  } = useAdminConsole();

  return (
    <>
      <ScreenHeader title={t("admin.title")} sub={t("admin.subtitle")} />
      <div className="content stack" style={{ maxWidth: 780 }}>
        <ConsoleStats
          owners={owners}
          loadingOwners={loadingOwners}
          registry={registry}
          activeStations={activeStations}
        />

        {registry === null && <Notice>{t("admin.registryMissing")}</Notice>}

        {credentials && (
          <Panel title={t("admin.newOwnerCredentials")}>
            <CredentialPanel
              username={credentials.username}
              pin={credentials.pin}
              subject={credentials.subject}
              onDismiss={() => setCredentials(null)}
            />
          </Panel>
        )}

        <NewOwnerForm
          form={form}
          setForm={setForm}
          set={set}
          phoneKey={phoneKey}
          error={error}
          busy={busy}
          complete={complete}
          onSubmit={submit}
        />

        <OwnerAccountsPanel
          owners={owners}
          loadingOwners={loadingOwners}
          staffOpen={staffOpen}
          staff={staff}
          stationsFor={stationsFor}
          onToggleStaff={toggleStaff}
          onResetPin={setResetting}
          onResetStation={setResettingStation}
        />

        <StationRegistryPanel registry={registry} onResetStation={setResettingStation} />

        <HowItWorksPanel />
      </div>

      {/* ---- reset a PIN (an owner's, or their staff's) ---- */}
      <Sheet
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={t("cred.settingFor", { name: resetting?.name || "" })}
      >
        {resetting && (
          <ResetPinPanel target={resetting} onDone={() => setResetting(null)} />
        )}
      </Sheet>

      {/* ---- reset station data confirmation ---- */}
      <ResetStationSheet
        open={!!resettingStation}
        station={resettingStation}
        onClose={() => setResettingStation(null)}
        onDone={() => loadOwners()}
      />
    </>
  );
}
