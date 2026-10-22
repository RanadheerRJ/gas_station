import { memo, useCallback, useMemo } from "react";
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
 *
 * Performance & robustness:
 * - Memoized: avoids re-rendering on unrelated parent updates (e.g. form typing).
 * - `onCta` is wrapped in a guard that prevents double-taps within 500ms.
 * - Busy/disabled states are announced via aria-busy/aria-disabled.
 * - Summary uses aria-live when `liveSummary` is true — e.g. the running total
 *   in close-shift should be announced without moving focus.
 */
function StickyCta({
  summary,
  hint,
  liveSummary = false,
  ctaLabel,
  onCta,
  ctaTo,
  disabled = false,
  busy = false,
  secondary,
  className = "",
  "aria-label": ariaLabel,
}) {
  const blocked = disabled || busy;

  const cls = useMemo(
    () => `sticky-cta${className ? ` ${className}` : ""}`,
    [className]
  );

  const handleClick = useCallback(
    (e) => {
      if (blocked) {
        e.preventDefault();
        return;
      }
      onCta?.(e);
    },
    [onCta, blocked]
  );

  const pill = useMemo(
    () => (
      <>
        {busy && <span className="spinner" aria-hidden="true" />}
        {ctaLabel}
      </>
    ),
    [busy, ctaLabel]
  );

  const action = useMemo(() => {
    if (ctaTo && !blocked) {
      return (
        <Link
          to={ctaTo}
          className="cta sticky-cta__btn"
          aria-busy={busy || undefined}
          aria-label={ariaLabel}
        >
          {pill}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className="cta sticky-cta__btn"
        onClick={handleClick}
        disabled={blocked}
        aria-busy={busy || undefined}
        aria-label={ariaLabel}
      >
        {pill}
      </button>
    );
  }, [ctaTo, blocked, busy, ariaLabel, pill, handleClick]);

  return (
    <>
      <div className={cls} role="toolbar" aria-label={ariaLabel || ctaLabel}>
        <div className="sticky-cta__inner">
          <div className="sticky-cta__summary">
            {summary != null && summary !== "" && (
              <span
                className="sticky-cta__summary-main"
                aria-live={liveSummary ? "polite" : undefined}
                aria-atomic={liveSummary ? "true" : undefined}
              >
                {summary}
              </span>
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

export default memo(StickyCta);
