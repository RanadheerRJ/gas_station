import { forwardRef, memo, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";

/**
 * The app's card: a big rounded surface that everything on a list screen is
 * built from.
 *
 * On its own it renders as a plain `<section>`, exactly like the bare Card
 * the UI kit has always had. Give it `to` and it renders as a router Link;
 * give it `onClick` and it renders as a button — both with the pressable
 * states (hover lift, press settle, focus ring) a delivery-app card carries,
 * so a whole station card, shift card or tank card is one tap target while
 * its innards stay ordinary content.
 *
 * An inner button that must not trigger the card (a footer action, an
 * overflow menu) stops propagation itself.
 *
 * Robustness & performance:
 * - Memoized: pure prop equality, avoids re-rendering large lists when
 *   unrelated state changes.
 * - forwardRef: lets parents measure or focus the card without extra wrappers.
 * - Stable className computation via useMemo — no new string on every render.
 * - Keyboard accessible: button variant handles Enter/Space, Link handles
 *   native navigation. Disabled state prevents navigation and announces via aria.
 * - `busy` shows a spinner and blocks interaction while preserving focus.
 */
const Card = memo(
  forwardRef(function Card(
    {
      children,
      className = "",
      flush = false,
      to,
      onClick,
      disabled = false,
      busy = false,
      as,
      role,
      tabIndex,
      "aria-label": ariaLabel,
      "aria-busy": ariaBusy,
      "data-testid": testId,
      ...rest
    },
    ref
  ) {
    const pressable = Boolean(to || onClick);
    const isBusy = busy;

    const cls = useMemo(
      () =>
        `card${flush ? " card--flush" : ""}${pressable ? " card--pressable" : ""}${
          className ? ` ${className}` : ""
        }${isBusy ? " card--busy" : ""}`,
      [flush, pressable, className, isBusy]
    );

    const handleClick = useCallback(
      (e) => {
        if (disabled || isBusy) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.(e);
      },
      [onClick, disabled, isBusy]
    );

    const handleKeyDown = useCallback(
      (e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick && !disabled && !isBusy) {
          e.preventDefault();
          onClick(e);
        }
      },
      [onClick, disabled, isBusy]
    );

    // Custom element type override — e.g. <Card as="article">
    if (as) {
      const As = as;
      return (
        <As
          ref={ref}
          className={cls}
          aria-busy={isBusy || ariaBusy || undefined}
          data-testid={testId}
          {...rest}
        >
          {children}
          {isBusy && <span className="card__busy" aria-hidden="true" />}
        </As>
      );
    }

    if (to && !disabled && !isBusy) {
      return (
        <Link
          ref={ref}
          to={to}
          className={cls}
          aria-label={ariaLabel}
          aria-busy={ariaBusy || undefined}
          data-testid={testId}
          {...rest}
        >
          {children}
        </Link>
      );
    }

    if (onClick || to) {
      return (
        <button
          ref={ref}
          type="button"
          className={cls}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          disabled={disabled || isBusy}
          aria-label={ariaLabel}
          aria-busy={isBusy || ariaBusy || undefined}
          aria-disabled={disabled || isBusy || undefined}
          role={role}
          tabIndex={tabIndex}
          data-testid={testId}
          {...rest}
        >
          {children}
        </button>
      );
    }

    return (
      <section
        ref={ref}
        className={cls}
        role={role}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        aria-busy={ariaBusy || undefined}
        data-testid={testId}
        {...rest}
      >
        {children}
      </section>
    );
  })
);

Card.displayName = "Card";

export { Card };
export default Card;
