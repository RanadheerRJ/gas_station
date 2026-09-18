import { useState } from "react";
import PinField, { pinReady } from "./PinField";
import { Notice } from "./ui";
import { readableError, resetPin } from "../lib/api";
import { useAuth } from "../state/AuthContext";

/**
 * Inline "set a new PIN" form for one subordinate account.
 * Authority is re-checked server-side; this only shows the affordance.
 */
export default function ResetPinPanel({ target, onDone }) {
  const { profile } = useAuth();
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
      await resetPin({ uid: target.uid, pin }, profile);
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
        New PIN set for {target.name} (<span className="mono">{target.username}</span>):{" "}
        <span className="mono" style={{ fontWeight: 600 }}>
          {pin}
        </span>
        . Share it with them now — it cannot be shown again.
      </Notice>
    );
  }

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 520 }}>
      <div className="small muted">
        Setting a new PIN for {target.name} (
        <span className="mono">{target.username}</span>). Their old PIN stops working
        immediately.
      </div>
      <div className="form-grid">
        <PinField
          pin={pin}
          confirm={confirm}
          onPin={setPin}
          onConfirm={setConfirm}
          label="New PIN"
          hint="4 digits"
        />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row">
        <button
          className="primary"
          type="submit"
          disabled={busy || !pinReady(pin, confirm)}
        >
          {busy ? "Setting…" : "Set new PIN"}
        </button>
        <button type="button" onClick={() => onDone?.()} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
