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
 */
export function Chip({
  label,
  selected = false,
  onClick,
  count,
  icon: Icon,
  tone = "",
  disabled = false,
  className = "",
  ...rest
}) {
  const cls = `chip${tone ? ` chip--${tone}` : ""}${className ? ` ${className}` : ""}`;
  const badge =
    count != null && Number.isFinite(Number(count)) ? (
      <span className="chip__count" aria-hidden="true">
        {count}
      </span>
    ) : null;
  const icon = Icon ? (
    <span className="chip__icon" aria-hidden="true">
      <Icon size={16} />
    </span>
  ) : null;

  if (!onClick) {
    return (
      <span className={cls} data-selected={selected || undefined} {...rest}>
        {icon}
        {label}
        {badge}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {label}
      {badge}
    </button>
  );
}

export function ChipRow({ children, label, className = "" }) {
  return (
    <div
      className={`chip-row${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
