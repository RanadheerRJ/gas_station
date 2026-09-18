import { useState } from "react";
import { NumberRoll } from "./motion.jsx";

export function Panel({ title, actions, children, flush = false, note }) {
  return (
    <section className={`panel${flush ? " flush" : ""}`}>
      {(title || actions) && (
        <header>
          <div>
            <h2>{title}</h2>
            {note && <div className="small muted">{note}</div>}
          </div>
          {actions && (
            <div className="row" style={{ gap: 8 }}>
              {actions}
            </div>
          )}
        </header>
      )}
      <div className="body">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <span className="muted small"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * A labelled figure.
 *
 * Pass `value` for static content, or `amount` (a number) to have the figure
 * count to its new value whenever it changes. `format` turns the interpolated
 * number back into the displayed string, so currency and litres keep their
 * existing formatting.
 */
export function Stat({ label, value, tone, amount, format, prefix = "" }) {
  const animated = typeof amount === "number" && Number.isFinite(amount);
  return (
    <div className="stat">
      <span className="k">{label}</span>
      <span className={`v${tone ? ` ${tone}` : ""}`}>
        {animated ? (
          <NumberRoll
            value={amount}
            format={(n) => `${prefix}${format ? format(n) : Math.round(n)}`}
          />
        ) : (
          value
        )}
      </span>
    </div>
  );
}

export function Notice({ kind = "info", children }) {
  if (!children) return null;
  const cls =
    kind === "error" ? "notice error" : kind === "good" ? "notice good" : "notice";
  return <div className={cls}>{children}</div>;
}

export function Empty({ children }) {
  return (
    <div className="muted small" style={{ padding: "16px 2px" }}>
      {children}
    </div>
  );
}

/**
 * Post-creation handover panel. The PIN was chosen by the creator, so this
 * confirms the username and echoes the PIN they just set for handover.
 */
export function CredentialPanel({ username, pin, onDismiss, subject }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = `Username: ${username}\nPIN: ${pin}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked; the figures are on screen anyway */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Notice kind="good">
        Account created for {subject}. Share the username and the PIN you chose — only its
        hash is stored, so it cannot be looked up later. If it is lost you can set a new
        one from this page.
      </Notice>
      <div className="credential">
        <div>
          <div className="k">Username</div>
          <div className="v">{username}</div>
        </div>
        <div>
          <div className="k">PIN</div>
          <div className="v">{pin}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy credentials"}
        </button>
        <button type="button" className="quiet" onClick={onDismiss}>
          Done, hide these
        </button>
      </div>
    </div>
  );
}
