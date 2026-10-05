import { useState } from "react";
import Money from "../../components/Money.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { money } from "../../lib/format";
import { entryTime } from "../../lib/statement.js";

/**
 * What the reviewer needs to know about this shift's credit before signing it
 * off: how much was taken, and whether any of it was corrected or voided by
 * the operator before it reached them. Tapping an indicator opens the audit
 * detail behind it — original, new, reason, who, when.
 */
export default function CreditReviewCard({ review }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!review || !review.entries) return null;
  const flagged = (review.modified || 0) + (review.voided || 0);
  const items = review.items || [];

  return (
    <section className="card card--flush credit-review">
      <div className="card__head">
        <h2>{t("shifts.creditReview")}</h2>
        <Money kind="credit" value={review.total} label={t("shifts.creditSales")} />
      </div>
      <div className="section-pad credit-review__chips">
        <span className="tag">
          {t("shifts.creditEntriesCount", { count: review.entries })}
        </span>
        {review.modified > 0 && (
          <span className="tag rust">
            ⚠ {t("shifts.creditModifiedCount", { count: review.modified })}
          </span>
        )}
        {review.voided > 0 && (
          <span className="tag rust">
            ⚠ {t("shifts.creditVoidedCount", { count: review.voided })}
          </span>
        )}
        {flagged > 0 && (
          <button type="button" className="small" onClick={() => setOpen((v) => !v)}>
            {open ? t("common.hide") : t("common.detail")}
          </button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul className="credit-review__items">
          {items.map((item) => (
            <li key={item.id} className="credit-review__item">
              <div>
                <strong>
                  {item.action === "voided" ? t("credit.voided") : t("credit.corrected")}{" "}
                  · {item.customerName}
                </strong>
                <span className="small muted">
                  {t("credit.originalLabel")} ₹{money(item.oldAmount)}
                  {item.action === "edited" && (
                    <>
                      {" → "}
                      {t("credit.newLabel")} ₹{money(item.newAmount)}
                    </>
                  )}
                </span>
                <span className="small muted">
                  {t("credit.reasonLabel")}: {item.reason || "—"}
                </span>
                <span className="small muted">
                  {item.action === "voided"
                    ? t("credit.voidedBy")
                    : t("credit.changedBy")}
                  : {item.actedByName} · {entryTime(item.actedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
