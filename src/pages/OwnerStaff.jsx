import { useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { CredentialPanel, Field, Notice } from "../components/ui.jsx";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import PinField, { pinReady } from "../components/PinField";
import Sheet from "../components/Sheet.jsx";
import StaffRoster from "../components/StaffRoster.jsx";
import { PlusIcon } from "../components/icons.jsx";
import { createStaff, listStaff, readableError } from "../lib/api";
import { phoneProblem } from "../lib/validate.js";
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

  const phoneKey = form.phone.trim() ? phoneProblem(form.phone.trim()) : null;
  const complete =
    form.name.trim() &&
    form.phone.trim() &&
    !phoneKey &&
    form.stationId &&
    pinReady(form.pin, form.confirmPin);

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
            onClick={() => {
              setError("");
              setInviteOpen(true);
            }}
          >
            <PlusIcon size={16} />
            {t("staff.createLogin")}
          </button>
        }
      />
      <div className="content stack">
        <StaffRoster
          staff={staff}
          loading={loading}
          emptyHeadline={t("staff.none")}
          stationName={stationName}
        />
      </div>

      {/* ---- create a login ---- */}
      <Sheet
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setCredentials(null);
          setError("");
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
              <Field label={t("common.name")} required>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  maxLength={120}
                  placeholder="Suresh Babu"
                  disabled={busy}
                />
              </Field>
              <Field label={t("common.phone")} required>
                <input
                  className="mono"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  required
                  maxLength={24}
                  aria-invalid={phoneKey ? true : undefined}
                  placeholder="+91 98765 44556"
                  disabled={busy}
                />
                {phoneKey && (
                  <span className="small" style={{ color: "var(--rust)" }}>
                    {t(phoneKey)}
                  </span>
                )}
              </Field>
              <Field label={t("common.station")} required>
                <select
                  value={form.stationId}
                  required
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, stationId: e.target.value }))}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("staff.role")} required>
                <select
                  value={form.role}
                  required
                  disabled={busy}
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
                disabled={busy}
              />
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            <div className="row" style={{ gap: 8 }}>
              <button className="cta" type="submit" disabled={busy || !complete}>
                {busy ? t("staff.creating") : t("staff.createLogin")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false);
                  setCredentials(null);
                  setError("");
                }}
                disabled={busy}
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
