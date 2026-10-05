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
 */
export default function Money({ kind, value, label, size = "md" }) {
  const numeric = Number(value);
  const amount = Number.isFinite(numeric) ? numeric : 0;
  const verdict = kind === "variance" ? varianceLabel(value) : null;
  const varianceState =
    verdict === "balanced"
      ? "ok"
      : verdict === "short"
        ? "short"
        : verdict === "excess"
          ? "over"
          : "neutral";
  const marker = kind === "variance" ? VARIANCE_MARKERS[verdict] : MARKERS[kind];
  const classes = [
    "money",
    `money--${kind}`,
    kind === "variance" ? `money--${varianceState}` : "",
    size === "lg" ? "money--lg" : "money--md",
  ]
    .filter(Boolean)
    .join(" ");
  const formatted = money(Math.abs(amount));
  const accessibleAmount = `${amount < 0 ? "minus " : ""}${formatted}`;

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
