import { memo, useCallback, useState } from "react";
import PinField, { pinReady } from "./PinField";
import { Notice } from "./ui";
import { readableError, resetOwnPin } from "../lib/api";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Change your own PIN. The current PIN is asked for and checked server-side
 * through a real Auth sign-in, so a borrowed, unlocked device cannot be used
 * to quietly replace the owner of the account.
 *
 * Collapsed, this is one calm button; expanded, a three-field form. Both
 * shapes live inside the account panel.
 *
 * Robust: prevents double-submit via busy guard, clears error on typing,
 * sanitizes inputs, announces errors via role=alert.
 */
function ChangePinPanel() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setCurrent("");
    setPin("");
    setConfirm("");
    setError("");
    setDone(false);
  }, []);

  const openPanel = useCallback(() => setOpen(true), []);

  const handleCurrent = useCallback(
    (e) => {
      setCurrent(e.target.value.replace(/\D/g, "").slice(0, 4));
      if (error) setError("");
    },
    [error]
  );

  const canSubmit = current.length === 4 && pinReady(pin, confirm) && !busy;

  const submit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSubmit) return;
      setError("");
      setBusy(true);
      try {
        await resetOwnPin({ currentPin: current, newPin: pin });
        setDone(true);
      } catch (err) {
        setError(readableError(err));
      } finally {
        setBusy(false);
      }
    },
    [canSubmit, current, pin]
  );

  if (!open) {
    return (
      <button
        type="button"
        className="account-panel__control account-panel__button"
        onClick={openPanel}
      >
        {t("account.changePin")}
      </button>
    );
  }

  if (done) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <Notice kind="good">{t("cred.pinChanged")}</Notice>
        <div className="small muted">{t("cred.pinChangedNote")}</div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" onClick={close}>
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit} noValidate>
      <label className="field">
        <span>
          {t("cred.currentPin")}
          <span className="req" title={t("common.required")} aria-hidden="true">
            {" "}
            *
          </span>
          <span className="muted small"> · {t("cred.fourDigits")}</span>
        </span>
        <input
          className="mono"
          inputMode="numeric"
          type="password"
          maxLength={4}
          required
          value={current}
          onChange={handleCurrent}
          placeholder="••••"
          autoComplete="current-password"
          style={{ letterSpacing: "0.35em", textAlign: "center" }}
        />
      </label>
      <PinField
        pin={pin}
        confirm={confirm}
        onPin={setPin}
        onConfirm={setConfirm}
        label={t("cred.newPin")}
        hint={t("cred.ownPinHint")}
      />
      {error && (
        <Notice kind="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button
          className="primary"
          type="submit"
          disabled={!canSubmit}
          aria-busy={busy || undefined}
        >
          {busy ? t("cred.changing") : t("cred.setNewPin")}
        </button>
        <button type="button" onClick={close} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export default memo(ChangePinPanel);
