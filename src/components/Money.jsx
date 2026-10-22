import { memo, useMemo } from "react";
import { money } from "../lib/format.js";
import { varianceLabel } from "../lib/shiftMath.js";

const MARKERS = {
  in: "+",
  out: "−",
  credit: "◷",
  neutral: "=",
};

const VARIANCE_MARKERS = {
  balanced: "✓",
  short: "▼",
  excess: "▲",
  "not declared": "—",
};

/**
 * One visual language for rupee figures.
 *
 * The marker is deliberately redundant with colour: a monochrome display (or
 * colour-vision difference) still says received, spent, on credit, total, or
 * the direction of a variance. `label` names the figure to assistive tech;
 * the surrounding row continues to carry the visible translated label.
 *
 * Memoized: Money appears in every row of every table — memo + useMemo
 * avoid recomputing format/variance on re-renders caused by unrelated state.
 */
function Money({ kind, value, label, size = "md" }) {
  const { marker, formatted, accessibleAmount, classes, verdict } = useMemo(() => {
    const numeric = Number(value);
    const amount = Number.isFinite(numeric) ? numeric : 0;
    const v = kind === "variance" ? varianceLabel(value) : null;
    const varianceState =
      v === "balanced"
        ? "ok"
        : v === "short"
          ? "short"
          : v === "excess"
            ? "over"
            : "neutral";
    const m = kind === "variance" ? VARIANCE_MARKERS[v] : MARKERS[kind];
    const cls = [
      "money",
      `money--${kind}`,
      kind === "variance" ? `money--${varianceState}` : "",
      size === "lg" ? "money--lg" : "money--md",
    ]
      .filter(Boolean)
      .join(" ");
    const fmt = money(Math.abs(amount));
    const acc = `${amount < 0 ? "minus " : ""}${fmt}`;
    return { marker: m, formatted: fmt, accessibleAmount: acc, classes: cls, verdict: v };
  }, [kind, value, size]);

  return (
    <span
      className={classes}
      data-variance={verdict || undefined}
      aria-label={[label, `₹ ${accessibleAmount}`].filter(Boolean).join(", ")}
    >
      <span className="money__marker" aria-hidden="true">
        {marker || "="}
      </span>
      <span className="money__amount" aria-hidden="true">
        ₹ {formatted}
      </span>
    </span>
  );
}

export default memo(Money);
