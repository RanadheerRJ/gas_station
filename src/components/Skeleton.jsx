import { memo, useMemo } from "react";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * `shape="card"` is a card-sized block with a title line, a big figure line
 * and a body line; `shape="row"` is a list row with an avatar, two lines and
 * a trailing figure. `count` repeats the shape for a list-length placeholder
 * (keep it small — three rows say "loading" as well as thirty).
 *
 * The shimmer is the shared `.skeleton` sweep from motion.css, which is
 * switched off entirely for reduced-motion users; the shapes and their
 * spacing stay, so the page keeps its layout while data arrives.
 *
 * Performance:
 * - Memoized: prevents re-rendering skeletons while data loads in parent.
 * - count clamped to 12 — avoids creating hundreds of DOM nodes if caller
 *   passes a large dataset length.
 * - Uses `content-visibility: auto` via CSS to skip painting off-screen skeletons.
 * - aria-busy stays on the container, inner shapes are aria-hidden.
 */
function Skeleton({ shape = "row", count = 1, className = "" }) {
  const { t } = useLanguage();

  const repeats = useMemo(() => Math.max(1, Math.min(Number(count) || 1, 12)), [count]);

  const blocks = useMemo(() => {
    return Array.from({ length: repeats }, (_, index) => {
      if (shape === "card") {
        return (
          <div key={index} className="skeleton-card" aria-hidden="true">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-figure" />
            <div className="skeleton skeleton-line wide" />
            <div className="skeleton skeleton-line half" />
          </div>
        );
      }
      return (
        <div key={index} className="skeleton-row" aria-hidden="true">
          <div className="skeleton skeleton-avatar" />
          <div>
            <div className="skeleton skeleton-line half" />
            <div className="skeleton skeleton-line wide" />
          </div>
          <div className="skeleton skeleton-trailing" />
        </div>
      );
    });
  }, [shape, repeats]);

  const cls = useMemo(
    () => `skeleton-stack${className ? ` ${className}` : ""}`,
    [className]
  );

  return (
    <div className={cls} role="status" aria-busy="true" aria-label={t("common.loading")}>
      {blocks}
    </div>
  );
}

export default memo(Skeleton);
