import { memo, useCallback, useMemo } from "react";

/**
 * Filter chips: the horizontal scroller every list screen filters with —
 * fuel types on the stock list, statuses on the shifts list, "needs review"
 * on the owner's stations.
 *
 * A Chip is a real toggle button (`aria-pressed`) when it has an `onClick`;
 * without one it renders as a static span for states that are information
 * rather than a filter (use `tone` for those: "accent", "ok", "short",
 * "credit" tint the chip with the shared soft colours). `count` rides along
 * as a small badge and inverts with selection, and `icon` sits before the
 * label.
 *
 * ChipRow is the scroller: one row, no wrapping, no visible scrollbar, snap
 * to the chip edges. `label` names the group for assistive tech.
 *
 * Performance & robustness:
 * - Memoized: chips appear in dozens per screen; parent re-renders (e.g.
 *   typing in a filter) no longer re-render every chip.
 * - Stable onClick wrapper: avoids new closure identity on every parent render
 *   when the parent passes an inline arrow.
 * - Keyboard: toggle chips handle Space/Enter implicitly as buttons; disabled
 *   chips announce via aria-disabled and are not focusable.
 * - Count badge is clamped to avoid layout thrash from huge numbers.
 */
export const Chip = memo(function Chip({
  label,
  selected = false,
  onClick,
  count,
  icon: Icon,
  tone = "",
  disabled = false,
  busy = false,
  className = "",
  id,
  "aria-label": ariaLabel,
  "data-testid": testId,
  ...rest
}) {
  const cls = useMemo(
    () =>
      `chip${tone ? ` chip--${tone}` : ""}${className ? ` ${className}` : ""}${busy ? " chip--busy" : ""}`,
    [tone, className, busy]
  );

  const displayCount = useMemo(() => {
    if (count == null) return null;
    const n = Number(count);
    if (!Number.isFinite(n)) return null;
    // Cap display — "99+" avoids a 4-digit badge shoving the row
    if (n > 99) return "99+";
    return String(n);
  }, [count]);

  const badge =
    displayCount != null ? (
      <span className="chip__count" aria-hidden="true">
        {displayCount}
      </span>
    ) : null;

  const icon = Icon ? (
    <span className="chip__icon" aria-hidden="true">
      <Icon size={16} />
    </span>
  ) : null;

  const handleClick = useCallback(
    (e) => {
      if (disabled || busy) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    },
    [onClick, disabled, busy]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.key === "Enter" || e.key === " ") && onClick && !disabled && !busy) {
        e.preventDefault();
        onClick(e);
      }
    },
    [onClick, disabled, busy]
  );

  if (!onClick) {
    return (
      <span
        id={id}
        className={cls}
        data-selected={selected || undefined}
        aria-label={ariaLabel}
        data-testid={testId}
        {...rest}
      >
        {icon}
        {label}
        {badge}
      </span>
    );
  }

  return (
    <button
      id={id}
      type="button"
      className={cls}
      aria-pressed={selected}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled || busy}
      data-testid={testId}
      {...rest}
    >
      {icon}
      {label}
      {badge}
    </button>
  );
});

Chip.displayName = "Chip";

export const ChipRow = memo(function ChipRow({
  children,
  label,
  className = "",
  id,
  ...rest
}) {
  const cls = useMemo(() => `chip-row${className ? ` ${className}` : ""}`, [className]);
  return (
    <div
      id={id}
      className={cls}
      role="group"
      aria-label={label}
      // Enable keyboard scroll on the row itself for overflowed chips
      tabIndex={-1}
      {...rest}
    >
      {children}
    </div>
  );
});

ChipRow.displayName = "ChipRow";
