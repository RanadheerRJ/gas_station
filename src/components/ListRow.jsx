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
 */
export default function ListRow({
  icon: Icon,
  avatar,
  title,
  subtitle,
  trailing,
  chevron = true,
  to,
  onClick,
  className = "",
  ...rest
}) {
  const interactive = Boolean(to || onClick);
  const cls =
    `list-row${interactive ? " list-row--press" : ""}` +
    `${className ? ` ${className}` : ""}`;

  const lead = avatar ? (
    <span
      className="list-row__avatar"
      style={{ "--avatar-hue": avatarHue(avatar) }}
      aria-hidden="true"
    >
      {initials(avatar)}
    </span>
  ) : Icon ? (
    <span className="list-row__icon" aria-hidden="true">
      <Icon size={20} />
    </span>
  ) : null;

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
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...rest}>
        {body}
      </button>
    );
  }

  return (
    <div className={cls} {...rest}>
      {body}
    </div>
  );
}
