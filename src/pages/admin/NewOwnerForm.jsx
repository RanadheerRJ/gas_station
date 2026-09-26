import { Field, Notice, Panel } from "../../components/ui";
import PinField from "../../components/PinField";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The one form that creates an owner and their first station. Every field is
 * required, because the Edge Function that mints the account takes them all
 * in a single call; the PIN typed here is the only copy that will ever exist
 * in plain text.
 */
export default function NewOwnerForm({
  form,
  setForm,
  set,
  phoneKey,
  error,
  busy,
  complete,
  onSubmit,
}) {
  const { t } = useLanguage();
  return (
    <Panel title={t("admin.ownerDetails")} note={t("admin.ownerDetailsNote")}>
      <form className="stack" onSubmit={onSubmit}>
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
  );
}
