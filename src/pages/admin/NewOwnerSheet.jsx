import { useEffect } from "react";
import Sheet from "../../components/Sheet.jsx";
import { Field, Notice } from "../../components/ui";
import PinField from "../../components/PinField";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The one form that creates an owner and their first station. Every field is
 * required, because the Edge Function that mints the account takes them all
 * in a single call; the PIN typed here is the only copy that will ever exist
 * in plain text.
 *
 * The sheet closes itself the moment credentials come back — they are shown
 * on the console behind it, where they stay until the developer has handed
 * them over and dismisses them.
 */
export default function NewOwnerSheet({
  open,
  onClose,
  form,
  setForm,
  set,
  phoneKey,
  error,
  busy,
  complete,
  onSubmit,
  credentials,
}) {
  const { t } = useLanguage();

  useEffect(() => {
    if (open && credentials) onClose();
  }, [open, credentials, onClose]);

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("admin.newOwner")}
      wide
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={onSubmit}>
        <p className="small muted" style={{ margin: 0 }}>
          {t("admin.ownerDetailsNote")}
        </p>

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

        <div className="row" style={{ gap: 8 }}>
          <button className="primary" type="submit" disabled={busy || !complete}>
            {busy ? t("admin.creatingAccount") : t("admin.createOwner")}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
