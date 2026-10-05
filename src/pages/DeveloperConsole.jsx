import { useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { CredentialPanel, Notice, Panel, Segmented } from "../components/ui";
import ResetPinPanel from "../components/ResetPinPanel";
import ResetStationSheet from "../components/ResetStationSheet.jsx";
import Sheet, { useSheetSubject } from "../components/Sheet.jsx";
import { PlusIcon, RefreshIcon } from "../components/icons.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";
import { useAdminConsole } from "./admin/useAdminConsole.js";
import { useConsoleActions } from "./admin/useConsoleActions.js";
import ConsoleStats from "./admin/ConsoleStats.jsx";
import OwnersPanel from "./admin/OwnersPanel.jsx";
import StationsPanel from "./admin/StationsPanel.jsx";
import NewOwnerSheet from "./admin/NewOwnerSheet.jsx";
import StationSheet from "./admin/StationSheet.jsx";
import EditAccountSheet from "./admin/EditAccountSheet.jsx";
import DeleteStationSheet from "./admin/DeleteStationSheet.jsx";
import DeleteAccountSheet from "./admin/DeleteAccountSheet.jsx";
import HowItWorksPanel from "./admin/HowItWorksPanel.jsx";

/**
 * The developer console.
 *
 * Two lists, one job each: the owner accounts this console has issued, and
 * every station on the platform. Both are searchable, and everything that can
 * be done to a row — create, correct, archive, reset, delete — happens in a
 * sheet over that row rather than on a screen somewhere else, so the console
 * never loses the developer's place in a list they were working through.
 *
 * Nothing here belongs to a station's day-to-day. A developer still reads no
 * shift, price, tank, or credit row; what they can reach is the registry and
 * the accounts, which is exactly what a support request is ever about.
 */
export default function DeveloperConsole() {
  const { t } = useLanguage();
  const admin = useAdminConsole();
  const actions = useConsoleActions(admin.loadOwners);
  const [tab, setTab] = useState("owners");

  // One sheet is open at a time. `station: null` inside stationSheet means
  // "create one for this owner"; a station means "manage that one".
  const [newOwnerOpen, setNewOwnerOpen] = useState(false);
  const [stationSheet, setStationSheet] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deletingStation, setDeletingStation] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);

  const closeSheets = () => {
    setStationSheet(null);
    setEditingAccount(null);
    setDeletingStation(null);
    setDeletingAccount(null);
  };

  /** Run a console action, and close whatever sheet asked for it on success. */
  const commit = async (promise) => {
    const ok = await promise;
    if (ok) closeSheets();
    return ok;
  };

  const owners = admin.owners;
  // The PIN sheet keeps its target while it slides out.
  const resetTarget = useSheetSubject(admin.resetting, !!admin.resetting);
  const newStation = (ownerId) =>
    setStationSheet({ station: null, ownerId: ownerId || owners[0]?.uid || "" });

  return (
    <>
      <ScreenHeader
        title={t("admin.title")}
        sub={t("admin.subtitle")}
        actions={
          <>
            <button
              type="button"
              className="tool-btn"
              onClick={() => admin.loadOwners()}
              disabled={admin.loadingOwners}
            >
              <RefreshIcon size={15} />
              {t("admin.refresh")}
            </button>
            {tab === "stations" && owners.length > 0 ? (
              <button
                type="button"
                className="tool-btn tool-btn--primary"
                onClick={() => newStation()}
              >
                <PlusIcon size={16} />
                {t("admin.newStation")}
              </button>
            ) : (
              <button
                type="button"
                className="tool-btn tool-btn--primary"
                onClick={() => setNewOwnerOpen(true)}
              >
                <PlusIcon size={16} />
                {t("admin.newOwner")}
              </button>
            )}
          </>
        }
      />

      <div className="content stack">
        <ConsoleStats
          owners={owners}
          loadingOwners={admin.loadingOwners}
          registry={admin.registry}
          activeStations={admin.activeStations}
        />

        {admin.registry === null && <Notice>{t("admin.registryMissing")}</Notice>}
        {actions.done && (
          <Notice kind="good">{t(actions.done.key, actions.done.params)}</Notice>
        )}
        {actions.error && <Notice kind="error">{actions.error}</Notice>}

        {admin.credentials && (
          <Panel title={t("admin.newOwnerCredentials")}>
            <CredentialPanel
              username={admin.credentials.username}
              pin={admin.credentials.pin}
              subject={admin.credentials.subject}
              onDismiss={() => admin.setCredentials(null)}
            />
          </Panel>
        )}

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "owners", label: t("admin.tabOwners") },
            { value: "stations", label: t("admin.tabStations") },
          ]}
        />

        {tab === "owners" ? (
          <>
            <OwnersPanel
              owners={owners}
              loadingOwners={admin.loadingOwners}
              staffOpen={admin.staffOpen}
              staff={admin.staff}
              stationsFor={admin.stationsFor}
              onToggleStaff={admin.toggleStaff}
              onResetPin={admin.setResetting}
              onEditAccount={setEditingAccount}
              onDeleteAccount={setDeletingAccount}
              onAddStation={newStation}
              onManageStation={(station) => setStationSheet({ station })}
              onNewOwner={() => setNewOwnerOpen(true)}
            />
            <HowItWorksPanel />
          </>
        ) : (
          <StationsPanel
            registry={admin.registry}
            loading={admin.loadingOwners}
            onManage={(station) => setStationSheet({ station })}
            onNewStation={() => newStation()}
            canCreate={owners.length > 0}
          />
        )}
      </div>

      {/* ---- create an owner (and their first station) ---- */}
      <NewOwnerSheet
        open={newOwnerOpen}
        onClose={() => setNewOwnerOpen(false)}
        form={admin.form}
        setForm={admin.setForm}
        set={admin.set}
        phoneKey={admin.phoneKey}
        error={admin.error}
        busy={admin.busy}
        complete={admin.complete}
        onSubmit={async (event) => {
          await admin.submit(event);
        }}
        credentials={admin.credentials}
      />

      {/* ---- create or manage a station ---- */}
      <StationSheet
        open={!!stationSheet}
        station={stationSheet?.station || null}
        defaultOwnerId={stationSheet?.ownerId || ""}
        owners={owners}
        busy={actions.busy}
        error={actions.error}
        onClose={() => setStationSheet(null)}
        onCreate={(payload) => commit(actions.createStation(payload))}
        onSave={(station, patch) => commit(actions.updateStation(station, patch))}
        onSetState={(station, state) => commit(actions.setStationState(station, state))}
        onResetData={(station) => {
          setStationSheet(null);
          admin.setResettingStation({ id: station.stationId, name: station.name });
        }}
        onDelete={(station) => {
          setStationSheet(null);
          setDeletingStation(station);
        }}
      />

      {/* ---- correct a name or phone number ---- */}
      <EditAccountSheet
        open={!!editingAccount}
        account={editingAccount}
        busy={actions.busy}
        error={actions.error}
        onClose={() => setEditingAccount(null)}
        onSave={(account, patch) => commit(actions.updateAccount(account, patch))}
      />

      {/* ---- delete a station, for good ---- */}
      <DeleteStationSheet
        open={!!deletingStation}
        station={deletingStation}
        busy={actions.busy}
        error={actions.error}
        onClose={() => setDeletingStation(null)}
        onConfirm={(station) => commit(actions.removeStation(station))}
      />

      {/* ---- delete a login, for good ---- */}
      <DeleteAccountSheet
        open={!!deletingAccount}
        account={deletingAccount}
        stations={deletingAccount ? admin.stationsFor(deletingAccount.uid) || [] : []}
        busy={actions.busy}
        error={actions.error}
        onClose={() => setDeletingAccount(null)}
        onConfirm={(account) => commit(actions.removeAccount(account))}
      />

      {/* ---- reset a PIN (an owner's, or their staff's) ---- */}
      <Sheet
        open={!!admin.resetting}
        onClose={() => admin.setResetting(null)}
        title={t("cred.settingFor", { name: resetTarget?.name || "" })}
      >
        {resetTarget && (
          <ResetPinPanel target={resetTarget} onDone={() => admin.setResetting(null)} />
        )}
      </Sheet>

      {/* ---- reset station data confirmation ---- */}
      <ResetStationSheet
        open={!!admin.resettingStation}
        station={admin.resettingStation}
        onClose={() => admin.setResettingStation(null)}
        onDone={() => admin.loadOwners()}
      />
    </>
  );
}
