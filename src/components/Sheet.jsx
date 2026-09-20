import { useEffect, useState } from "react";
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
    if (phase === "closed") return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  if (phase === "closed") return null;

  return (
    <div className={`sheet-root${phase === "closing" ? " closing" : ""}`}>
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
