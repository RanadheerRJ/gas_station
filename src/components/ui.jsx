import { useState } from "react";
import { NumberRoll } from "./motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

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

export function Field({ label, hint, required = false, children }) {
  const { t } = useLanguage();
  return (
    <label className="field">
      <span>
        {label}
        {required && (
          <span
            className="req"
            title={t("common.required")}
            aria-label={t("common.required")}
          >
            {" "}
            *
          </span>
        )}
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
 * A bare card: the Panel's body without its header chrome. Most screens in
 * the app-shell world are one card each, and a titled bar above every one of
 * them would be noise.
 */
export function Card({ children, className = "", flush = false }) {
  return (
    <section className={`card${flush ? " card--flush" : ""} ${className}`.trim()}>
      {children}
    </section>
  );
}

/**
 * The checkout bar. One screen, one primary action, always in the same place
 * at the bottom — the thumb lands there without looking, the way a delivery
 * app's "Place order" always is. Renders the fixed bar plus the in-flow
 * spacer that keeps the last row of content out from under it.
 */
export function ActionBar({ children }) {
  return (
    <>
      <div className="action-bar" role="toolbar">
        <div className="action-bar__inner">{children}</div>
      </div>
      {/* Clears the fixed bar (and the tab bar beneath it on phones) so the
          last row of a long list is never trapped underneath. */}
      <div className="action-bar__spacer" aria-hidden="true" />
    </>
  );
}

/** A compact either/or switch, e.g. "record a dip" vs "book a delivery". */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Post-creation handover panel. The PIN was chosen by the creator, so this
 * confirms the username and echoes the PIN they just set for handover.
 */
export function CredentialPanel({ username, pin, onDismiss, subject }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = `${t("cred.username")}: ${username}\n${t("cred.pin")}: ${pin}`;
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
      <Notice kind="good">{t("cred.created", { name: subject })}</Notice>
      <div className="credential">
        <div>
          <div className="k">{t("cred.username")}</div>
          <div className="v">{username}</div>
        </div>
        <div>
          <div className="k">{t("cred.pin")}</div>
          <div className="v">{pin}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" onClick={copy}>
          {copied ? t("cred.copied") : t("cred.copy")}
        </button>
        <button type="button" className="quiet" onClick={onDismiss}>
          {t("cred.done")}
        </button>
      </div>
    </div>
  );
}
