import { useEffect, useState } from "react";
import Sheet, { useSheetSubject } from "../../components/Sheet.jsx";
import { Field, Notice } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Removing a login for good.
 *
 * An owner is only removable once they hold nothing — the sheet names the
 * stations still in the way rather than failing after the fact — and the
 * name has to be typed, because an owner is the one account whose removal
 * cannot be undone by re-issuing a login. A manager or attendant is a plain
 * confirmation: their history stays, attributed exactly as it was.
 */
export default function DeleteAccountSheet({
  open,
  account: subject,
  stations,
  busy,
  error,
  onClose,
  onConfirm,
}) {
  const { t } = useLanguage();
  const [typed, setTyped] = useState("");
  const account = useSheetSubject(subject, open);

  const name = account?.name || "";
  const isOwner = account?.role === "owner";
  const blocking = isOwner ? stations || [] : [];

  useEffect(() => {
    if (open) setTyped("");
  }, [open, account]);

  const matches =
    !isOwner ||
    (name.trim() !== "" && typed.trim().toLowerCase() === name.trim().toLowerCase());
  const allowed = matches && blocking.length === 0;

  const submit = (event) => {
    event.preventDefault();
    if (!allowed || busy) return;
    onConfirm(account);
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("admin.deleteAccountTitle", { name })}
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <Notice kind="error">
          {isOwner ? t("admin.deleteOwnerWarning") : t("admin.deleteLoginWarning")}
        </Notice>

        {blocking.length > 0 && (
          <Notice kind="attention">
            {t("admin.deleteOwnerBlocked", {
              names: blocking.map((station) => station.name).join(", "),
            })}
          </Notice>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {isOwner && blocking.length === 0 && (
          <Field label={t("admin.confirmName", { name })} required>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={name}
              disabled={busy}
              autoFocus
            />
          </Field>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="danger" disabled={busy || !allowed}>
            {busy ? t("admin.deleting") : t("admin.deleteAccountAction")}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
