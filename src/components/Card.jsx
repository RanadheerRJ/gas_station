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
 */
export function Card({
  children,
  className = "",
  flush = false,
  to,
  onClick,
  disabled = false,
  ...rest
}) {
  const pressable = Boolean(to || onClick);
  const cls =
    `card${flush ? " card--flush" : ""}${pressable ? " card--pressable" : ""}` +
    `${className ? ` ${className}` : ""}`;

  if (to && !disabled) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  if (onClick || to) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        disabled={disabled}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <section className={cls} {...rest}>
      {children}
    </section>
  );
}

export default Card;
