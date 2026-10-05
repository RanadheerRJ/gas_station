import Money from "../../components/Money.jsx";
import { ActionBar } from "../../components/ui.jsx";
import { varianceLabel } from "../../lib/shiftMath.js";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { PAYMENT_KEY } from "./parts.jsx";

const RECEIVED_MODES = ["cash", "card", "upi", "other"];

function AttentionNotice({ totals, t }) {
  const verdict = varianceLabel(totals.variance);
  const hasVariance = verdict === "short" || verdict === "excess";
  const hasCredit = Number(totals.payments.credit) > 0;
  if (!hasVariance && !hasCredit) return null;

  return (
    <div className="review-attention" role="note">
      {hasVariance && (
        <span className="review-attention__line">
          <span>
            {t(
              verdict === "short" ? "money.cashShortAttention" : "money.cashOverAttention"
            )}
          </span>
          <Money kind="variance" value={totals.variance} label={t("shifts.variance")} />
          <span>{t("money.checkBeforeApproving")}</span>
        </span>
      )}
      {hasCredit && (
        <span className="review-attention__line">
          <Money
            kind="credit"
            value={totals.payments.credit}
            label={t("money.givenOnCredit")}
          />
          <span>{t("money.creditAttention")}</span>
        </span>
      )}
    </div>
  );
}

function ReviewFigures({ totals, t }) {
  const receivedModes = RECEIVED_MODES.filter(
    (mode) => Number(totals.payments[mode]) !== 0
  );
  if (receivedModes.length === 0) receivedModes.push("cash");

  return (
    <div className="review-figures" aria-label={t("money.keyFigures")}>
      <span className="review-figures__item" data-review-figure="sales">
        <span>{t("money.salesShort")}</span>
        <Money kind="neutral" value={totals.gross} label={t("money.totalSales")} />
      </span>
      <span className="review-figures__item" data-review-figure="received">
        <span>{t("money.receivedShort")}</span>
        <span className="review-figures__received">
          {receivedModes.map((mode) => (
            <span key={mode} title={t(PAYMENT_KEY[mode])}>
              <Money
                kind="in"
                value={totals.payments[mode]}
                label={t(PAYMENT_KEY[mode])}
              />
            </span>
          ))}
        </span>
      </span>
      <span className="review-figures__item" data-review-figure="credit">
        <span>{t("money.creditShort")}</span>
        <Money
          kind="credit"
          value={totals.payments.credit}
          label={t("money.givenOnCredit")}
        />
      </span>
      <span className="review-figures__item" data-review-figure="variance">
        <span>{t("money.varianceShort")}</span>
        <Money kind="variance" value={totals.variance} label={t("shifts.variance")} />
      </span>
    </div>
  );
}

/**
 * The sign-off bar: approve, which locks the shift, or send it back with a
 * reason the operator will see on their correction form.
 */
export default function ReviewActionBar({
  totals,
  busy,
  rejecting,
  setRejecting,
  reason,
  setReason,
  submitRejection,
  onApprove,
}) {
  const { t } = useLanguage();
  return (
    <ActionBar className="action-bar--review">
      <div className="action-bar__stack" data-testid="review-action-bar">
        <AttentionNotice totals={totals} t={t} />
        {rejecting && (
          <div className="row action-bar__reason">
            <input
              style={{ flex: 1 }}
              value={reason}
              placeholder={t("shifts.whatNeedsCorrecting")}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={submitRejection}
            >
              {t("common.confirm")}
            </button>
          </div>
        )}
        <ReviewFigures totals={totals} t={t} />
        <div className="action-bar__row">
          <span className="small muted action-bar__hint">{t("money.approvalLocks")}</span>
          <button
            type="button"
            className="review-send-back"
            disabled={busy}
            onClick={() => setRejecting((v) => !v)}
          >
            {t("shifts.sendBack")}
          </button>
          <button
            type="button"
            className="cta review-approve"
            disabled={busy}
            onClick={() => onApprove()}
          >
            {t("shifts.approve")}
          </button>
        </div>
      </div>
    </ActionBar>
  );
}
