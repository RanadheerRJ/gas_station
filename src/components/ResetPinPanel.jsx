import { useState } from "react";
import PinField, { pinReady } from "./PinField";
import { Notice } from "./ui";
import { readableError, resetPin } from "../lib/api";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Inline "set a new PIN" form for one subordinate account.
 * Authority is re-checked server-side; this only shows the affordance.
 */
export default function ResetPinPanel({ target, onDone }) {
  const { t } = useLanguage();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
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
  };

  if (done) {
    return (
      <Notice kind="good">
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
    <form className="stack" onSubmit={submit} style={{ maxWidth: 520 }}>
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
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row">
        <button
          className="primary"
          type="submit"
          disabled={busy || !pinReady(pin, confirm)}
        >
          {busy ? t("cred.setting") : t("cred.setNewPin")}
        </button>
        <button type="button" onClick={() => onDone?.()} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
