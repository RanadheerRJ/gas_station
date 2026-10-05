import { useEffect, useState } from "react";
import Sheet, { useSheetSubject } from "../../components/Sheet.jsx";
import { Field, Notice } from "../../components/ui";
import { phoneProblem } from "../../lib/validate.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Correcting the name or phone number on an account — a mistyped owner, a
 * new number for a manager.
 *
 * The username is shown but never editable: it is half of the Auth login, so
 * rewriting it here would quietly lock the account out. A forgotten PIN has
 * its own path, and so does deletion.
 */
export default function EditAccountSheet({
  open,
  account: subject,
  busy,
  error,
  onClose,
  onSave,
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: "", phone: "" });
  const account = useSheetSubject(subject, open);

  useEffect(() => {
    if (!open || !account) return;
    setForm({ name: account.name || "", phone: account.phone || "" });
  }, [open, account]);

  const phoneKey = form.phone.trim() ? phoneProblem(form.phone.trim()) : null;
  const complete = form.name.trim() && !phoneKey;

  const submit = (event) => {
    event.preventDefault();
    if (!complete || busy) return;
    onSave(account, { name: form.name.trim(), phone: form.phone.trim() });
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("admin.editAccountTitle", { name: account?.name || "" })}
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <div className="credential">
          <div>
            <div className="k">{t("staff.username")}</div>
            <div className="v">{account?.username}</div>
          </div>
          <div>
            <div className="k">{t("staff.role")}</div>
            <div className="v">{account ? t(`role.${account.role}`) : ""}</div>
          </div>
        </div>

        <Field label={t("common.name")} required>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
            maxLength={120}
            disabled={busy}
            autoFocus
          />
        </Field>
        <Field label={t("common.phone")}>
          <input
            className="mono"
            inputMode="tel"
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
            maxLength={24}
            disabled={busy}
            aria-invalid={phoneKey ? true : undefined}
          />
          {phoneKey && (
            <span className="small" style={{ color: "var(--rust)" }}>
              {t(phoneKey)}
            </span>
          )}
        </Field>

        {error && <Notice kind="error">{error}</Notice>}

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="primary" disabled={busy || !complete}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
