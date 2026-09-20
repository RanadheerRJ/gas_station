import { Fragment, useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { CredentialPanel, Empty, Field, Notice, Panel, Stat } from "../components/ui";
import PinField, { pinReady } from "../components/PinField";
import ResetPinPanel from "../components/ResetPinPanel";
import Sheet from "../components/Sheet.jsx";
import { phoneProblem } from "../lib/validate.js";
import {
  adminStationRegistry,
  createOwner,
  listOwnerStaff,
  listOwners,
  readableError,
} from "../lib/api";
import { LoadingPanels } from "../components/motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

const BLANK = {
  ownerName: "",
  stationName: "",
  phone: "",
  address: "",
  pin: "",
  confirmPin: "",
};

export default function AdminInviteOwner() {
  const { t } = useLanguage();
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  // null = the registry RPC is not reachable (not deployed, or a deploy raced
  // `supabase db push`); [] = genuinely no stations yet.
  const [registry, setRegistry] = useState(null);
  const [staffOpen, setStaffOpen] = useState(null);
  const [staff, setStaff] = useState({});
  const [resetting, setResetting] = useState(null);

  const loadOwners = useCallback(async () => {
    setLoadingOwners(true);
    try {
      const [ownerRows, stations] = await Promise.all([
        listOwners().catch(() => null),
        adminStationRegistry().catch(() => null),
      ]);
      setOwners(ownerRows || []);
      setRegistry(stations);
    } finally {
      setLoadingOwners(false);
    }
  }, []);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  // Credentials live in component state only — leaving the page loses them,
  // which is the intent: the raw PIN is never recoverable.
  useEffect(() => () => setCredentials(null), []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const stationsFor = useCallback(
    (ownerUid) =>
      registry ? registry.filter((station) => station.ownerId === ownerUid) : null,
    [registry]
  );

  const toggleStaff = async (owner) => {
    if (staffOpen === owner.uid) {
      setStaffOpen(null);
      return;
    }
    setStaffOpen(owner.uid);
    // The entry appears only once the roster resolves, so the panel can tell
    // "still loading" from "genuinely no logins".
    if (staff[owner.uid]) return;
    try {
      const rows = await listOwnerStaff(owner);
      setStaff((s) => ({ ...s, [owner.uid]: { rows, error: "" } }));
    } catch (err) {
      setStaff((s) => ({
        ...s,
        [owner.uid]: { rows: [], error: readableError(err) },
      }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCredentials(null);
    setBusy(true);
    try {
      const res = await createOwner({
        ownerName: form.ownerName.trim(),
        stationName: form.stationName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        pin: form.pin,
      });
      setCredentials({ ...res, pin: form.pin, subject: form.ownerName.trim() });
      setForm(BLANK);
      await loadOwners();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const phoneKey = form.phone.trim() ? phoneProblem(form.phone.trim()) : null;
  const complete =
    form.ownerName.trim() &&
    form.stationName.trim() &&
    form.phone.trim() &&
    form.address.trim() &&
    !phoneKey &&
    pinReady(form.pin, form.confirmPin);

  const activeStations = registry
    ? registry.filter((station) => station.state === "active").length
    : null;

  return (
    <>
      <ScreenHeader title={t("admin.title")} sub={t("admin.subtitle")} />
      <div className="content stack" style={{ maxWidth: 780 }}>
        {/* ---- the console's day at a glance ---- */}
        <section className="card stat-strip">
          <Stat
            label={t("admin.statOwners")}
            value={loadingOwners ? "—" : String(owners.length)}
          />
          <Stat
            label={t("admin.statStations")}
            value={registry === null ? "—" : String(registry.length)}
          />
          <Stat
            label={t("admin.statActive")}
            value={activeStations === null ? "—" : String(activeStations)}
          />
          <Stat
            label={t("admin.statArchived")}
            value={registry === null ? "—" : String(registry.length - activeStations)}
          />
        </section>

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

        <Panel title={t("admin.ownerDetails")} note={t("admin.ownerDetailsNote")}>
          <form className="stack" onSubmit={submit}>
            <div className="form-grid">
              <Field label={t("admin.ownerName")} required>
                <input
                  value={form.ownerName}
                  onChange={set("ownerName")}
                  required
                  maxLength={120}
                  placeholder="Ravi Kumar"
                />
              </Field>
              <Field label={t("admin.phoneNumber")} required>
                <input
                  className="mono"
                  inputMode="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  required
                  maxLength={24}
                  aria-invalid={phoneKey ? true : undefined}
                  placeholder="+91 98480 11223"
                />
                {phoneKey && (
                  <span className="small" style={{ color: "var(--rust)" }}>
                    {t(phoneKey)}
                  </span>
                )}
              </Field>
              <Field label={t("admin.stationName")} required>
                <input
                  value={form.stationName}
                  onChange={set("stationName")}
                  required
                  maxLength={120}
                  placeholder="Highway 44 Fuel Point"
                />
              </Field>
              <Field label={t("admin.stationAddress")} required>
                <input
                  value={form.address}
                  onChange={set("address")}
                  required
                  maxLength={300}
                  placeholder="NH-44, Shamirpet, Hyderabad"
                />
              </Field>
              <PinField
                pin={form.pin}
                confirm={form.confirmPin}
                onPin={(v) => setForm((f) => ({ ...f, pin: v }))}
                onConfirm={(v) => setForm((f) => ({ ...f, confirmPin: v }))}
                label={t("admin.pinForOwner")}
              />
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <div className="row">
              <button className="primary" type="submit" disabled={busy || !complete}>
                {busy ? t("admin.creatingAccount") : t("admin.createOwner")}
              </button>
            </div>
          </form>
        </Panel>

        <Panel title={t("admin.ownerAccounts")} flush>
          {loadingOwners ? (
            <LoadingPanels count={2} lines={2} label={t("common.loading")} />
          ) : owners.length === 0 ? (
            <Empty>{t("admin.noOwners")}</Empty>
          ) : (
            <table>
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
                {owners.map((o) => {
                  const owned = stationsFor(o.uid);
                  const expanded = staffOpen === o.uid;
                  const entry = staff[o.uid];
                  return (
                    <Fragment key={o.uid}>
                      <tr>
                        <td style={{ fontWeight: 500 }}>{o.name}</td>
                        <td className="mono">{o.username}</td>
                        <td className="mono small">{o.phone}</td>
                        <td>
                          {owned === null ? (
                            <span className="muted">—</span>
                          ) : (
                            <>
                              <div className="num mono">{owned.length}</div>
                              {owned.length > 0 && (
                                <div
                                  className="small muted"
                                  title={owned.map((s) => s.name).join(", ")}
                                >
                                  {owned.map((s) => s.name).join(", ")}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="num">
                          <div
                            className="row"
                            style={{ gap: 8, justifyContent: "flex-end" }}
                          >
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => toggleStaff(o)}
                            >
                              {expanded ? t("admin.hideStaff") : t("admin.showStaff")}
                            </button>
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => setResetting(o)}
                            >
                              {t("staff.resetPin")}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={5} style={{ background: "var(--surface-sunken)" }}>
                            <div className="nested-panel">
                              {!entry ? (
                                <div className="small muted">
                                  {t("admin.loadingStaff")}
                                </div>
                              ) : entry.error ? (
                                <Notice kind="error">{entry.error}</Notice>
                              ) : entry.rows.length === 0 ? (
                                <Empty>{t("admin.noStaff")}</Empty>
                              ) : (
                                <table>
                                  <thead>
                                    <tr>
                                      <th>{t("common.name")}</th>
                                      <th>{t("staff.username")}</th>
                                      <th>{t("staff.role")}</th>
                                      <th>{t("common.station")}</th>
                                      <th />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entry.rows.map((member) => (
                                      <tr key={member.uid}>
                                        <td style={{ fontWeight: 500 }}>{member.name}</td>
                                        <td className="mono">{member.username}</td>
                                        <td>{t(`role.${member.role}`)}</td>
                                        <td className="small muted">
                                          {stationsFor(o.uid)?.find(
                                            (s) => s.stationId === member.stationIds[0]
                                          )?.name || "—"}
                                        </td>
                                        <td className="num">
                                          <button
                                            type="button"
                                            className="quiet"
                                            onClick={() => setResetting(member)}
                                          >
                                            {t("staff.resetPin")}
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={t("admin.howItWorks")}>
          <ul
            className="small muted"
            style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}
          >
            <li>
              The owner account is created by the <span className="mono">accounts</span>{" "}
              Supabase Edge Function. Its service key never reaches this browser.
            </li>
            <li>
              Supabase Auth stores a hash of the derived username + PIN password. The
              public database never stores a raw PIN or a PIN hash.
            </li>
            <li>
              You choose the owner’s opening PIN and hand it over. Only its hash is kept,
              so it cannot be read back — use <em>Reset PIN</em> above if it is ever lost.
            </li>
            <li>
              Owners create their own managers and attendants from their dashboard, and
              managers and owners can reset a forgotten staff PIN themselves — you only
              need to step in when an owner loses theirs.
            </li>
          </ul>
        </Panel>
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
    </>
  );
}
