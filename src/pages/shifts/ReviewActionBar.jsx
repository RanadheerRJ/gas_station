import { ActionBar } from "../../components/ui.jsx";
import { money } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

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
    <ActionBar>
      <div className="action-bar__stack">
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
        <div className="action-bar__row">
          <span className="small muted action-bar__hint">
            {t("shifts.approvingLocks", { amount: money(totals.handover) })}
          </span>
          <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)}>
            {t("shifts.sendBack")}
          </button>
          <button
            type="button"
            className="cta"
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
