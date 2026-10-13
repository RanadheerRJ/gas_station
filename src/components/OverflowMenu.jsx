import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../state/LanguageContext.jsx";

/** Three dots in a row — the conventional "more" mark, unlike the nav's Others tab icon. */
function DotsIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

/**
 * A "⋯" button that opens a small menu of secondary or rarely-used actions.
 *
 * It exists so the screen can keep one or two primary actions in view and tuck
 * the rest — especially destructive ones — one deliberate tap away.
 *
 * `items` is a list of `{ key, label, onClick, icon, danger, disabled }`.
 * Falsy entries are skipped, so callers can write `cond && {…}`. Entries with
 * `danger` are drawn in the warning colour and separated from the rest.
 *
 * Keyboard: Enter/Space/ArrowDown on the trigger opens it, Arrow keys, Home
 * and End move between items, Escape closes and returns focus to the trigger,
 * and Tab closes it. A press outside also closes it.
 */
export default function OverflowMenu({
  items,
  label,
  placement = "up",
  align = "end",
  className = "",
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const menuId = useId();
  const visible = (items || []).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const enabledItems = () =>
    Array.from(
      listRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []
    );

  // Move focus into the menu as it opens so the keyboard lands on the first item.
  useEffect(() => {
    if (open) enabledItems()[0]?.focus();
  }, [open]);

  if (!visible.length) return null;

  const closeAndRestore = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    const nodes = enabledItems();
    const index = nodes.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestore();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`overflow-menu ${open ? "is-open" : ""} ${className}`.trim()}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className="overflow-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label || t("common.moreActions")}
        title={label || t("common.moreActions")}
        onClick={() => setOpen((value) => !value)}
      >
        <DotsIcon size={20} />
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          className={`overflow-menu__list overflow-menu__list--${placement} overflow-menu__list--${align}`}
        >
          {visible.map((item, position) => (
            <button
              key={item.key || item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              className={`overflow-menu__item${item.danger ? " is-danger" : ""}${
                item.danger && position > 0 && !visible[position - 1].danger
                  ? " has-divider"
                  : ""
              }`}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
