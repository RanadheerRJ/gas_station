import { useCallback, useEffect, useState } from "react";
import { Notice, Stat } from "../../components/ui.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { creditDaySummary, readableError } from "../../lib/api";
import { money } from "../../lib/format";

/**
 * The station's credit movement today, for an owner or manager.
 *
 * The figures come from one aggregate RPC — not from adding up every
 * customer's history in the browser — and voided entries are excluded from
 * them by the database. Individual accounts stay on the customer statement;
 * this card is the day's totals and nothing more.
 */
export default function CreditActivity({ stationId }) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!stationId) return;
    try {
      setSummary(await creditDaySummary(stationId));
      setError("");
    } catch (err) {
      setError(readableError(err));
    }
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="card card--flush credit-activity">
      <div className="card__head credit-activity__head">
        <h2>{t("credit.todayHeading")}</h2>
        <span
          className={`credit-activity__net ${
            Number(summary?.netCredit || 0) > 0 ? "neg" : "pos"
          }`}
        >
          {t("credit.netCredit")} <b>₹ {money(Number(summary?.netCredit || 0))}</b>
        </span>
      </div>
      {error && (
        <div className="section-pad">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="stat-strip">
        <Stat
          label={t("credit.creditGiven")}
          amount={Number(summary?.creditGiven || 0)}
          format={money}
          prefix="₹ "
          tone="neg"
        />
        <Stat
          label={t("credit.payments")}
          amount={Number(summary?.payments || 0)}
          format={money}
          prefix="₹ "
          tone="pos"
        />
        <Stat
          label={t("credit.netCredit")}
          amount={Number(summary?.netCredit || 0)}
          format={money}
          prefix="₹ "
        />
      </div>
      <p className="credit-activity__counts section-pad small muted">
        <span>{t("credit.entriesCount", { count: Number(summary?.entries || 0) })}</span>
        <span>
          {t("credit.customersCount", { count: Number(summary?.customers || 0) })}
        </span>
        <span>
          {t("credit.attendantsCount", { count: Number(summary?.attendants || 0) })}
        </span>
      </p>
    </section>
  );
}
