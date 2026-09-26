import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion.jsx";
import { CloseIcon } from "./icons.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * A slide-up sheet, the container for quick actions — add an expense, pick a
 * report range, choose a "More" destination. The main screens stay lists and
 * details; anything small enough to be a step rather than a journey happens
 * here, over the screen, and dismisses back to exactly where you were.
 *
 * Mounted state is phase-driven so the sheet can animate out before it leaves
 * the DOM: `open` → slides up, `closing` → slides down, then unmounts.
 * Reduced-motion users skip straight to unmounted.
 */
export default function Sheet({ open, onClose, title, children, wide = false }) {
  const { t } = useLanguage();
  // "closed" | "open" | "closing"
  const [phase, setPhase] = useState(open ? "open" : "closed");
  const rootRef = useRef(null);
  const previousFocusRef = useRef(null);
  const hadOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    setPhase((current) => {
      if (current === "closed") return "closed";
      return prefersReducedMotion() ? "closed" : "closing";
    });
  }, [open]);

  useEffect(() => {
    if (phase !== "closing") return undefined;
    const timer = setTimeout(() => setPhase("closed"), 200);
    return () => clearTimeout(timer);
  }, [phase]);

  // The page behind a sheet must not scroll while the sheet is open, or a
  // thumb-drag on the backdrop scrolls the list out from under the dialog.
  useEffect(() => {
    if (phase === "closed") return undefined;
    const main = document.querySelector(".main");
    const previousBody = document.body.style.overflow;
    const previousMain = main?.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) main.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBody;
      if (main) main.style.overflow = previousMain || "";
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return undefined;
    if (!hadOpenRef.current) {
      previousFocusRef.current = document.activeElement;
      hadOpenRef.current = true;
    }
    rootRef.current?.focus();
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (phase !== "closed" || !hadOpenRef.current) return undefined;
    const element = previousFocusRef.current;
    previousFocusRef.current = null;
    hadOpenRef.current = false;
    if (element && document.contains(element) && typeof element.focus === "function") {
      element.focus();
    }
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        rootRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusable.length) {
        event.preventDefault();
        rootRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  // In an iOS standalone PWA the on-screen keyboard shrinks only the visual
  // viewport; the layout viewport that 100dvh and position: fixed size
  // against stays full-height, so a vh-capped sheet keeps its height and
  // the keyboard pushes its top rows off-screen. Track the visual viewport
  // and expose it as CSS custom properties (defaulted in styles.css, so
  // browsers without visualViewport support keep the old behaviour):
  // --sheet-viewport-h caps the sheet at the space actually visible, and
  // --sheet-viewport-offset pads the root up by however much the keyboard
  // covers at the bottom of the screen.
  useEffect(() => {
    if (phase === "closed") return undefined;
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return undefined;
    const apply = () => {
      root.style.setProperty("--sheet-viewport-h", `${Math.round(viewport.height)}px`);
      root.style.setProperty(
        "--sheet-viewport-offset",
        `${Math.round(window.innerHeight - viewport.height - viewport.offsetTop)}px`
      );
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty("--sheet-viewport-h");
      root.style.removeProperty("--sheet-viewport-offset");
    };
  }, [phase]);

  if (phase === "closed") return null;

  return (
    <div
      ref={rootRef}
      className={`sheet-root${phase === "closing" ? " closing" : ""}`}
      tabIndex={-1}
    >
      <div className="backdrop" onClick={onClose} />
      <div
        className={`sheet${wide ? " sheet--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet__grab" aria-hidden="true" />
        {title && (
          <div className="sheet__head">
            <h2>{title}</h2>
            <button
              type="button"
              className="sheet__close"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <CloseIcon size={17} />
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
