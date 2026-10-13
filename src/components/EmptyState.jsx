import { Link } from "react-router-dom";

/**
 * What a list says when there is nothing to show: one icon in a soft circle,
 * a headline, one line of body copy, and at most one action.
 *
 * The action is a real button (`onAction`) or a router Link (`actionTo`) —
 * never a decorative pill. Everything except the action is optional so the
 * same component covers "no shifts yet" (with a Start shift action) and a
 * bare "nothing recorded".
 */
export default function EmptyState({
  icon: Icon,
  headline,
  body,
  actionLabel,
  onAction,
  actionTo,
  className = "",
}) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ""}`}>
      {Icon && (
        <span className="empty-state__icon" aria-hidden="true">
          <Icon size={26} />
        </span>
      )}
      {headline && <h3 className="empty-state__title">{headline}</h3>}
      {body && <p className="empty-state__body">{body}</p>}
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="empty-state__action">
          {actionLabel}
        </Link>
      ) : actionLabel && onAction ? (
        <button type="button" className="empty-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
