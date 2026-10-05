import { money, num } from "../lib/format.js";
import { varianceLabel } from "../lib/shiftMath.js";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The cash-count verdict as a pill: matches, short, or over.
 *
 * Same rule as the reviewer side — `varianceLabel` with the shared rounding
 * tolerance — restated as one glanceable badge beside the cash the attendant
 * just typed. Informational only: it never blocks a submit, because a figure
 * that differs is sometimes the honest one (a note can say why).
 *
 * `null` (nothing declared yet) renders a quiet "not counted yet" hint, so
 * the row keeps its shape instead of flashing between states while counting.
 * The marker glyph repeats the verdict for anyone who does not read the
 * colour.
 */
export default function VariancePill({ variance }) {
  const { t } = useLanguage();
  const verdict = varianceLabel(variance);

  if (variance == null || verdict === "not declared") {
    return (
      <span className="variance-pill variance-pill--quiet">
        <span aria-hidden="true">—</span>
        {t("close.notCountedYet")}
      </span>
    );
  }

  if (verdict === "balanced") {
    return (
      <span className="variance-pill variance-pill--ok">
        <span aria-hidden="true">✓</span>
        {t("close.varianceMatches")}
      </span>
    );
  }

  if (verdict === "short") {
    return (
      <span className="variance-pill variance-pill--short">
        <span aria-hidden="true">▼</span>
        {t("close.varianceShort", { amount: money(Math.abs(num(variance))) })}
      </span>
    );
  }

  return (
    <span className="variance-pill variance-pill--over">
      <span aria-hidden="true">▲</span>
      {t("close.varianceOver", { amount: money(num(variance)) })}
    </span>
  );
}
