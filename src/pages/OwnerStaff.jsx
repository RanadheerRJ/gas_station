import { Fragment, useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { CredentialPanel, Field, Notice } from "../components/ui.jsx";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import PinField, { pinReady } from "../components/PinField";
import ResetPinPanel from "../components/ResetPinPanel";
import Sheet from "../components/Sheet.jsx";
import { PlusIcon } from "../components/icons.jsx";
import { createStaff, listStaff, readableError } from "../lib/api";
import { formatStamp } from "../lib/format";
import { LoadingPanels } from "../components/motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Staff & access (in the owner's "More"): the roster as the screen, and both
 * of its write actions — creating a login and resetting a PIN — in sheets,
 * where their short-lived results (the raw PIN) live and die.
 */
export default function OwnerStaff() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { stations } = useStations();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    stationId: "",
    role: "attendant",
    pin: "",
    confirmPin: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setStaff(await listStaff(profile));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (stations.length && !form.stationId) {
      setForm((f) => ({ ...f, stationId: stations[0].id }));
    }
  }, [stations, form.stationId]);

  const stationName = (id) => stations.find((s) => s.id === id)?.name || "—";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCredentials(null);
    setBusy(true);
    try {
      const res = await createStaff({
        name: form.name.trim(),
        phone: form.phone.trim(),
        stationId: form.stationId,
        role: form.role,
        pin: form.pin,
      });
      setCredentials({ ...res, pin: form.pin, subject: form.name.trim() });
      setForm((f) => ({ ...f, name: "", phone: "", pin: "", confirmPin: "" }));
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader
        title={t("staff.title")}
        sub={t("staff.subtitle")}
        actions={
          <button
            type="button"
            className="tool-btn tool-btn--primary"
            onClick={() => setInviteOpen(true)}
          >
            <PlusIcon size={16} />
            {t("staff.createLogin")}
          </button>
        }
      />
      <div className="content stack">
        {loading ? (
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        ) : staff.length === 0 ? (
          <div className="empty-card">
            <h2>{t("staff.none")}</h2>
          </div>
        ) : (
          <section className="card card--flush">
            <div className="card__head">
              <h2>{t("staff.existing")}</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("staff.username")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("staff.role")}</th>
                  <th>{t("common.station")}</th>
                  <th>{t("staff.created")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <Fragment key={member.uid}>
                    <tr>
                      <td style={{ fontWeight: 500 }}>{member.name}</td>
                      <td className="mono">{member.username}</td>
                      <td className="mono small">{member.phone}</td>
                      <td>{t(`role.${member.role}`)}</td>
                      <td>{stationName((member.stationIds || [])[0])}</td>
                      <td className="small muted">{formatStamp(member.createdAt)}</td>
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* ---- create a login ---- */}
      <Sheet
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setCredentials(null);
        }}
        title={t("staff.inviteTitle")}
        wide
      >
        {credentials ? (
          <CredentialPanel
            username={credentials.username}
            pin={credentials.pin}
            subject={credentials.subject}
            onDismiss={() => {
              setCredentials(null);
              setInviteOpen(false);
            }}
          />
        ) : (
          <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
            <p className="small muted" style={{ margin: 0 }}>
              {t("staff.inviteNote")}
            </p>
            <div className="form-grid">
              <Field label={t("common.name")}>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Suresh Babu"
                />
              </Field>
              <Field label={t("common.phone")}>
                <input
                  className="mono"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 44556"
                />
              </Field>
              <Field label={t("common.station")}>
                <select
                  value={form.stationId}
                  onChange={(e) => setForm((f) => ({ ...f, stationId: e.target.value }))}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("staff.role")}>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="attendant">{t("role.attendant")}</option>
                  <option value="manager">{t("role.manager")}</option>
                </select>
              </Field>
              <PinField
                pin={form.pin}
                confirm={form.confirmPin}
                onPin={(v) => setForm((f) => ({ ...f, pin: v }))}
                onConfirm={(v) => setForm((f) => ({ ...f, confirmPin: v }))}
                label={t("staff.pinForLogin")}
              />
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            <button
              className="cta"
              type="submit"
              disabled={
                busy ||
                !form.name.trim() ||
                !form.phone.trim() ||
                !form.stationId ||
                !pinReady(form.pin, form.confirmPin)
              }
            >
              {busy ? t("staff.creating") : t("staff.createLogin")}
            </button>
          </form>
        )}
      </Sheet>

      {/* ---- reset a PIN ---- */}
      <Sheet
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={t("cred.settingFor", { name: resetting?.name || "" })}
      >
        {resetting && <ResetPinPanel target={resetting} onDone={() => setResetting(null)} />}
      </Sheet>
    </>
  );
}
