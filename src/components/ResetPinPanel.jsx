import { memo, useCallback, useState } from "react";
import PinField, { pinReady } from "./PinField";
import { Notice } from "./ui";
import { readableError, resetPin } from "../lib/api";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Inline "set a new PIN" form for one subordinate account.
 * Authority is re-checked server-side; this only shows the affordance.
 *
 * Robust: busy guard prevents double-taps, error cleared on edit, success
 * shows the new PIN for handover with mono formatting.
 */
function ResetPinPanel({ target, onDone }) {
  const { t } = useLanguage();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = pinReady(pin, confirm) && !busy;

  const submit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSubmit) return;
      setError("");
      setBusy(true);
      try {
        await resetPin({ uid: target.uid, pin });
        setDone(true);
        onDone?.();
      } catch (err) {
        setError(readableError(err));
      } finally {
        setBusy(false);
      }
    },
    [canSubmit, target.uid, pin, onDone]
  );

  const handleCancel = useCallback(() => onDone?.(), [onDone]);

  if (done) {
    return (
      <Notice kind="good" role="status">
        {t("cred.newPinSet", { name: target.name })} (
        <span className="mono">{target.username}</span>):{" "}
        <span className="mono" style={{ fontWeight: 600 }}>
          {pin}
        </span>
        . {t("cred.shareNow")}
      </Notice>
    );
  }

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 520 }} noValidate>
      <div className="small muted">
        {t("cred.settingFor", { name: target.name })} (
        <span className="mono">{target.username}</span>)
      </div>
      <div className="form-grid">
        <PinField
          pin={pin}
          confirm={confirm}
          onPin={setPin}
          onConfirm={setConfirm}
          label={t("cred.newPin")}
          hint={t("cred.fourDigits")}
        />
      </div>
      {error && (
        <Notice kind="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="row">
        <button
          className="primary"
          type="submit"
          disabled={!canSubmit}
          aria-busy={busy || undefined}
        >
          {busy ? t("cred.setting") : t("cred.setNewPin")}
        </button>
        <button type="button" onClick={handleCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export default memo(ResetPinPanel);
