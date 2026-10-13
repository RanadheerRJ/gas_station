import { Link } from "react-router-dom";

/**
 * The checkout bar: "View cart · 3 items" for a fuel station.
 *
 * A summary on the left ("2 nozzles · ₹ 4,120"), the one primary action as a
 * pill on the right, pinned in the same place on every flow — above the tab
 * bar on phones, above the content edge on desktop, clear of the safe area
 * on both. It renders the fixed bar plus the in-flow spacer that keeps the
 * last row of content out from under it, the same contract the older
 * ActionBar has; screens migrate to this one component over time.
 *
 * Pass `ctaTo` for a navigation action or `onCta` for a submit; `summary`
 * and `hint` are the left-hand figures (the hint is where a disabled bar
 * says what is missing). `secondary` is an optional compact action —
 * Approve / Send-back pairs — rendered left of the pill. `busy` swaps the
 * label for a spinner and blocks further presses.
 */
export default function StickyCta({
  summary,
  hint,
  ctaLabel,
  onCta,
  ctaTo,
  disabled = false,
  busy = false,
  secondary,
  className = "",
}) {
  const blocked = disabled || busy;
  const pill = (
    <>
      {busy && <span className="spinner" aria-hidden="true" />}
      {ctaLabel}
    </>
  );

  let action;
  if (ctaTo && !blocked) {
    action = (
      <Link to={ctaTo} className="cta sticky-cta__btn" aria-busy={busy || undefined}>
        {pill}
      </Link>
    );
  } else {
    action = (
      <button
        type="button"
        className="cta sticky-cta__btn"
        onClick={onCta}
        disabled={blocked}
        aria-busy={busy || undefined}
      >
        {pill}
      </button>
    );
  }

  return (
    <>
      <div className={`sticky-cta${className ? ` ${className}` : ""}`}>
        <div className="sticky-cta__inner">
          <div className="sticky-cta__summary">
            {summary != null && summary !== "" && (
              <span className="sticky-cta__summary-main">{summary}</span>
            )}
            {hint && <span className="sticky-cta__hint">{hint}</span>}
          </div>
          {secondary && <span className="sticky-cta__secondary">{secondary}</span>}
          {action}
        </div>
      </div>
      {/* Clears the fixed bar (and the tab bar beneath it on phones) so the
          last row of a long list is never trapped underneath. */}
      <div className="sticky-cta__spacer" aria-hidden="true" />
    </>
  );
}
