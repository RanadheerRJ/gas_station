import { memo, useCallback, useMemo, useState } from "react";
import { NumberRoll } from "./motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

export const Panel = memo(function Panel({ title, actions, children, flush = false, note, className = "" }) {
  const cls = useMemo(
    () => `panel${flush ? " flush" : ""}${className ? ` ${className}` : ""}`,
    [flush, className]
  );
  return (
    <section className={cls}>
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
});
Panel.displayName = "Panel";

export const Field = memo(function Field({ label, hint, required = false, children, id, className = "" }) {
  const { t } = useLanguage();
  return (
    <label className={`field${className ? ` ${className}` : ""}`} htmlFor={id}>
      <span>
        {label}
        {required && (
          <span
            className="req"
            title={t("common.required")}
            aria-label={t("common.required")}
            aria-hidden="false"
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
});
Field.displayName = "Field";

/**
 * A labelled figure.
 *
 * Pass `value` for static content, or `amount` (a number) to have the figure
 * count to its new value whenever it changes. `format` turns the interpolated
 * number back into the displayed string, so currency and litres keep their
 * existing formatting.
 *
 * Memoized: Stat appears in strips of 4+; memo avoids re-rendering all stats
 * when only one changes. NumberRoll itself is already optimized for RAF.
 */
export const Stat = memo(function Stat({ label, value, tone, amount, format, prefix = "" }) {
  const animated = typeof amount === "number" && Number.isFinite(amount);
  const toneCls = useMemo(() => `v${tone ? ` ${tone}` : ""}`, [tone]);
  return (
    <div className="stat">
      <span className="k">{label}</span>
      <span className={toneCls}>
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
});
Stat.displayName = "Stat";

export const Notice = memo(function Notice({ kind = "info", children, dismissible, onDismiss, role }) {
  if (!children) return null;
  const cls = useMemo(
    () =>
      kind === "error"
        ? "notice error"
        : kind === "good"
          ? "notice good"
          : kind === "attention"
            ? "notice attention"
            : "notice",
    [kind]
  );
  const ariaRole = role || (kind === "error" ? "alert" : kind === "attention" ? "status" : undefined);
  return (
    <div className={cls} role={ariaRole}>
      <span style={{ flex: 1 }}>{children}</span>
      {dismissible && onDismiss && (
        <button
          type="button"
          className="quiet"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ flex: "0 0 auto" }}
        >
          ×
        </button>
      )}
    </div>
  );
});
Notice.displayName = "Notice";

export const Empty = memo(function Empty({ children, className = "" }) {
  return (
    <div className={`muted small${className ? ` ${className}` : ""}`} style={{ padding: "16px 2px" }}>
      {children}
    </div>
  );
});
Empty.displayName = "Empty";

/**
 * The app's card: re-exported from Card.jsx for backward compat.
 */
export { Card } from "./Card.jsx";

/**
 * The checkout bar. One screen, one primary action, always in the same place
 * at the bottom — the thumb lands there without looking, the way a delivery
 * app's "Place order" always is. Renders the fixed bar plus the in-flow
 * spacer that keeps the last row of content out from under it.
 */
export const ActionBar = memo(function ActionBar({ children, className = "" }) {
  const variant = useMemo(() => (className ? ` ${className}` : ""), [className]);
  return (
    <>
      <div className={`action-bar${variant}`} role="toolbar">
        <div className="action-bar__inner">{children}</div>
      </div>
      <div
        className={`action-bar__spacer${className ? ` ${className}__spacer` : ""}`}
        aria-hidden="true"
      />
    </>
  );
});
ActionBar.displayName = "ActionBar";

/** A compact either/or switch, e.g. "record a dip" vs "book a delivery". */
export const Segmented = memo(function Segmented({ value, onChange, options, label }) {
  const handleChange = useCallback((v) => () => onChange?.(v), [onChange]);
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={handleChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
});
Segmented.displayName = "Segmented";

/**
 * Post-creation handover panel. The PIN was chosen by the creator, so this
 * confirms the username and echoes the PIN they just set for handover.
 */
export function CredentialPanel({ username, pin, onDismiss, subject }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const text = `${t("cred.username")}: ${username}\n${t("cred.pin")}: ${pin}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked; the figures are on screen anyway */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [t, username, pin]);

  const handleDismiss = useCallback(() => onDismiss?.(), [onDismiss]);

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
        <button type="button" className="quiet" onClick={handleDismiss}>
          {t("cred.done")}
        </button>
      </div>
    </div>
  );
}
