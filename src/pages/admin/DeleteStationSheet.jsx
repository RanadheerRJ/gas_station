import { useEffect, useState } from "react";
import Sheet, { useSheetSubject } from "../../components/Sheet.jsx";
import { Field, Notice } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Deleting a station, confirmed by typing its name.
 *
 * This is the only action in the app that removes a station row, so the
 * sheet spells out everything that goes with it — the operational history,
 * the logins posted there — and what survives: the owner account, and every
 * other station they hold.
 */
export default function DeleteStationSheet({
  open,
  station: subject,
  busy,
  error,
  onClose,
  onConfirm,
}) {
  const { t } = useLanguage();
  const [typed, setTyped] = useState("");
  const station = useSheetSubject(subject, open);

  const name = station?.name || "";
  const logins = station?.staffCount ?? 0;

  useEffect(() => {
    if (open) setTyped("");
  }, [open, station]);

  const matches =
    name.trim() !== "" && typed.trim().toLowerCase() === name.trim().toLowerCase();

  const submit = (event) => {
    event.preventDefault();
    if (!matches || busy) return;
    onConfirm(station);
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("admin.deleteStationTitle", { name })}
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <Notice kind="error">{t("admin.deleteStationWarning")}</Notice>
        {logins > 0 && (
          <Notice kind="attention">
            {t(
              logins === 1 ? "admin.deleteStationLoginOne" : "admin.deleteStationLogins",
              {
                count: logins,
              }
            )}
          </Notice>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          {t("admin.deleteStationKeeps")}
        </p>

        {error && <Notice kind="error">{error}</Notice>}

        <Field label={t("station.resetConfirmPrompt", { name })} required>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={name}
            disabled={busy}
            autoFocus
          />
        </Field>

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="danger" disabled={busy || !matches}>
            {busy ? t("admin.deleting") : t("admin.deleteStationAction")}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
