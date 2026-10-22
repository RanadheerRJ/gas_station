import { useCallback, useEffect, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
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
 *
 * Robustness & performance:
 * - Proper focus trap: cycles focus inside the sheet, restores to trigger on close.
 * - Scroll lock via CSS + inline overflow, cleaned up on unmount even if
 *   parent unmounts mid-animation.
 * - Viewport tracking via visualViewport for iOS PWA keyboard — rAF-batched
 *   to avoid layout thrash.
 * - All timers/RAF/listeners cleaned up on unmount — no leaks if sheet is
 *   removed while closing.
 * - Portal to document.body — never clipped by parent overflow.
 * - ESC and backdrop both close; backdrop uses pointerdown to feel instant.
 */

/**
 * The row a sheet is showing, held for as long as the sheet is on screen.
 *
 * A sheet animates out over about a fifth of a second. If the screen clears
 * the row at the moment it asks the sheet to close — which it must, because
 * that state is also what holds the sheet open — the title and body blank
 * out mid-slide. Keeping the last value it was opened with lets the sheet
 * leave showing what the user was just looking at. Opening with nothing
 * (a "create one" sheet) still reads as nothing.
 */
export function useSheetSubject(subject, open) {
  const last = useRef(subject);
  if (open) last.current = subject;
  return open ? subject : last.current;
}

const CLOSE_DURATION = 200;

function Sheet({ open, onClose, title, children, wide = false }) {
  const { t } = useLanguage();
  // "closed" | "open" | "closing"
  const [phase, setPhase] = useState(open ? "open" : "closed");
  const rootRef = useRef(null);
  const previousFocusRef = useRef(null);
  const hadOpenRef = useRef(false);
  const closeTimerRef = useRef(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = 0;
      }
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
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = 0;
      setPhase("closed");
    }, CLOSE_DURATION);
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = 0;
      }
    };
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
        handleClose();
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
  }, [phase, handleClose]);

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
    let frame = null;
    const apply = () => {
      frame = null;
      root.style.setProperty("--sheet-viewport-h", `${Math.round(viewport.height)}px`);
      root.style.setProperty(
        "--sheet-viewport-offset",
        `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`
      );
    };
    const schedule = () => {
      if (frame !== null) return;
      frame =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(apply)
          : setTimeout(apply, 16);
    };
    apply();
    viewport.addEventListener("resize", schedule, { passive: true });
    viewport.addEventListener("scroll", schedule, { passive: true });
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (frame !== null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
        else clearTimeout(frame);
      }
      try {
        root.style.removeProperty("--sheet-viewport-h");
        root.style.removeProperty("--sheet-viewport-offset");
      } catch {
        // Node may already be removed
      }
    };
  }, [phase]);

  if (phase === "closed") return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={`sheet-root${phase === "closing" ? " closing" : ""}`}
      tabIndex={-1}
    >
      <div className="backdrop" onClick={handleClose} />
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
              onClick={handleClose}
              aria-label={t("common.close")}
            >
              <CloseIcon size={17} />
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default memo(Sheet);
