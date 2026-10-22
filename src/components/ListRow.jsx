import { memo, useMemo, useCallback, forwardRef } from "react";
import { Link } from "react-router-dom";
import { avatarHue, initials } from "../lib/avatar.js";
import { ChevronIcon } from "./icons.jsx";

/**
 * The order-history row: the shape every dated entry on every list takes —
 * an operator, a customer, a tank, a day of the ledger.
 *
 * Lead with `icon` (a component from icons.jsx) or `avatar` (a name — the
 * initials and their stable colour are derived the same way shift cards do
 * it), title and subtitle in the middle, `trailing` for the one figure worth
 * reading (a Money, a status tag), and a chevron when the row goes
 * somewhere. `to` renders a router Link, `onClick` a button, and with
 * neither it is a static row — informational, not a dead tap target.
 *
 * Performance:
 * - Memoized: lists render hundreds of rows; memo avoids re-rendering
 *   unchanged rows when e.g. a filter changes elsewhere.
 * - Avatar hue/initials memoized — avoids recomputing hash on every render.
 * - forwardRef so virtualized lists can measure rows.
 *
 * Robustness:
 * - Handles missing title/subtitle gracefully (doesn't render empty spans).
 * - Disabled / busy states block navigation and announce via aria.
 * - Keyboard handlers for button variant ensure Enter/Space trigger correctly.
 */
const ListRow = memo(
  forwardRef(function ListRow(
    {
      icon: Icon,
      avatar,
      title,
      subtitle,
      trailing,
      chevron = true,
      to,
      onClick,
      className = "",
      disabled = false,
      busy = false,
      "aria-label": ariaLabel,
      "data-testid": testId,
      ...rest
    },
    ref
  ) {
    const interactive = Boolean(to || onClick);
    const isDisabled = disabled || busy;

    const cls = useMemo(
      () =>
        `list-row${interactive ? " list-row--press" : ""}${className ? ` ${className}` : ""}${busy ? " list-row--busy" : ""}`,
      [interactive, className, busy]
    );

    const avatarProps = useMemo(() => {
      if (!avatar) return null;
      return {
        hue: avatarHue(avatar),
        letter: initials(avatar),
      };
    }, [avatar]);

    const lead = useMemo(() => {
      if (avatarProps) {
        return (
          <span
            className="list-row__avatar"
            style={{ "--avatar-hue": avatarProps.hue }}
            aria-hidden="true"
          >
            {avatarProps.letter}
          </span>
        );
      }
      if (Icon) {
        return (
          <span className="list-row__icon" aria-hidden="true">
            <Icon size={20} />
          </span>
        );
      }
      return null;
    }, [avatarProps, Icon]);

    const handleClick = useCallback(
      (e) => {
        if (isDisabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.(e);
      },
      [onClick, isDisabled]
    );

    const body = (
      <>
        {lead}
        <span className="list-row__main">
          {title != null && title !== "" && (
            <span className="list-row__title">{title}</span>
          )}
          {subtitle != null && subtitle !== "" && (
            <span className="list-row__subtitle">{subtitle}</span>
          )}
        </span>
        {trailing != null && trailing !== "" && (
          <span className="list-row__trailing">{trailing}</span>
        )}
        {interactive && chevron && (
          <span className="list-row__chevron" aria-hidden="true">
            <ChevronIcon size={18} />
          </span>
        )}
        {busy && <span className="list-row__busy spinner" aria-hidden="true" />}
      </>
    );

    if (to && !isDisabled) {
      return (
        <Link
          ref={ref}
          to={to}
          className={cls}
          aria-label={ariaLabel}
          aria-busy={busy || undefined}
          data-testid={testId}
          {...rest}
        >
          {body}
        </Link>
      );
    }

    if (onClick) {
      return (
        <button
          ref={ref}
          type="button"
          className={cls}
          onClick={handleClick}
          disabled={isDisabled}
          aria-label={ariaLabel}
          aria-busy={busy || undefined}
          aria-disabled={isDisabled || undefined}
          data-testid={testId}
          {...rest}
        >
          {body}
        </button>
      );
    }

    return (
      <div
        ref={ref}
        className={cls}
        aria-label={ariaLabel}
        aria-busy={busy || undefined}
        data-testid={testId}
        {...rest}
      >
        {body}
      </div>
    );
  })
);

ListRow.displayName = "ListRow";

export default ListRow;
