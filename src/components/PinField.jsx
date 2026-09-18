import { useState } from "react";
import { pinProblem } from "../lib/api";

/**
 * PIN entry with confirmation. The creator chooses the PIN, so both boxes
 * must agree before the form will submit — a typo here would lock someone
 * out of an account they have never used.
 */
export default function PinField({
  pin,
  confirm,
  onPin,
  onConfirm,
  label = "PIN for this account",
  hint = "4 digits — you will share this with them",
}) {
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);

  const problem = pin ? pinProblem(pin) : null;
  const mismatch = confirm.length === 4 && pin !== confirm;
  const show = touched || pin.length === 4;

  return (
    <>
      <label className="field">
        <span>
          {label}
          <span className="muted small"> · {hint}</span>
        </span>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <input
            className="mono"
            inputMode="numeric"
            type={visible ? "text" : "password"}
            maxLength={4}
            value={pin}
            onBlur={() => setTouched(true)}
            onChange={(e) => onPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            style={{ letterSpacing: "0.35em", textAlign: "center" }}
          />
          <button
            type="button"
            className="small"
            onClick={() => setVisible((v) => !v)}
            style={{ whiteSpace: "nowrap" }}
          >
            {visible ? "hide" : "show"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>Confirm PIN</span>
        <input
          className="mono"
          inputMode="numeric"
          type={visible ? "text" : "password"}
          maxLength={4}
          value={confirm}
          onChange={(e) => onConfirm(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          style={{ letterSpacing: "0.35em", textAlign: "center" }}
        />
        {show && problem && (
          <span className="small" style={{ color: "var(--rust)" }}>
            {problem}
          </span>
        )}
        {!problem && mismatch && (
          <span className="small" style={{ color: "var(--rust)" }}>
            The two PINs do not match.
          </span>
        )}
      </label>
    </>
  );
}

/** True when the pair is safe to submit. */
export function pinReady(pin, confirm) {
  return !pinProblem(pin) && pin === confirm;
}
