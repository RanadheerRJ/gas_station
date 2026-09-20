import { useEffect, useRef, useState } from "react";
import { pinProblem } from "../lib/api";
import { useOneShot } from "./motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * PIN entry with confirmation. The creator chooses the PIN, so both boxes
 * must agree before the form will submit — a typo here would lock someone
 * out of an account they have never used.
 */
export default function PinField({ pin, confirm, onPin, onConfirm, label, hint }) {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t("staff.pinForLogin");
  const resolvedHint = hint ?? t("cred.pinHint");
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);

  const problem = pin ? pinProblem(pin) : null;
  const mismatch = confirm.length === 4 && pin !== confirm;
  const show = touched || pin.length === 4;

  // Feedback fires only once the fourth digit lands: judging a PIN halfway
  // through typing it would knock the box on every keystroke.
  const complete = pin.length === 4;
  const rejected = complete && Boolean(problem);
  const pairComplete = complete && confirm.length === 4;
  const matched = pairComplete && !problem && pin === confirm;

  // A one-shot needs a value that changes, not a boolean that stays true, or
  // correcting a PIN to another bad one would pass unremarked.
  const rejectKey = rejected ? `${pin}:${problem}` : "";
  const mismatchKey = pairComplete && pin !== confirm ? `${pin}:${confirm}` : "";

  const pinShake = useOneShot(rejectKey, { className: "shake" });
  const confirmShake = useOneShot(mismatchKey, { className: "shake" });

  // The accepted cue marks the moment the pair became valid, and is not
  // re-shown while the user keeps editing an already-valid pair.
  const acceptedRef = useRef(false);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    if (matched && !acceptedRef.current) {
      acceptedRef.current = true;
      setAccepted(true);
      const timer = setTimeout(() => setAccepted(false), 260);
      return () => clearTimeout(timer);
    }
    if (!matched) acceptedRef.current = false;
    return undefined;
  }, [matched]);

  return (
    <>
      <label className="field">
        <span>
          {resolvedLabel}
          <span className="req" title={t("common.required")} aria-hidden="true">
            {" "}
            *
          </span>
          <span className="muted small"> · {resolvedHint}</span>
        </span>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <input
            className={`mono ${pinShake}`.trim()}
            inputMode="numeric"
            type={visible ? "text" : "password"}
            maxLength={4}
            required
            value={pin}
            aria-invalid={rejected || undefined}
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
            {visible ? t("cred.hide") : t("cred.show")}
          </button>
        </div>
      </label>

      <label className="field">
        <span>
          {t("cred.confirmPin")}
          <span className="req" title={t("common.required")} aria-hidden="true">
            {" "}
            *
          </span>
        </span>
        <input
          className={`mono ${confirmShake} ${accepted ? "field-accepted" : ""}`.trim()}
          inputMode="numeric"
          type={visible ? "text" : "password"}
          maxLength={4}
          required
          value={confirm}
          aria-invalid={mismatch || undefined}
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
            {t("cred.pinMismatch")}
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
