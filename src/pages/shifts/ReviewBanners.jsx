import { Link } from "react-router-dom";
import { Notice } from "../../components/ui.jsx";
import { formatStamp } from "../../lib/format";
import { SHIFT_STATUS } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * What happened to this shift, and what the person looking at it can do
 * next: why it was sent back, that it is approved and locked, the way into
 * a correction, and the owner's reopen control.
 */
export default function ReviewBanners({
  shift,
  locked,
  canResubmit,
  correctionUrl,
  canReopen,
  busy,
  reopening,
  setReopening,
  reopenReason,
  setReopenReason,
  submitReopen,
}) {
  const { t } = useLanguage();
  return (
    <>
      {shift.status === SHIFT_STATUS.REJECTED && shift.rejectionReason && (
        <Notice kind="error">
          {t("shifts.sentBackBy", {
            who: shift.rejectedByName || t("shifts.theOwner"),
          })}
          : {shift.rejectionReason}
        </Notice>
      )}
      {locked && (
        <Notice kind="good">
          {t("shifts.approvedBy", {
            who: shift.approvedByName || t("shifts.theOwner"),
          })}
          {shift.approvedAt ? ` · ${formatStamp(shift.approvedAt)}` : ""}.{" "}
          {t("shifts.nowLocked")}
        </Notice>
      )}
      {canResubmit && correctionUrl && (
        <section className="card correction-card">
          <div>
            <h2>{t("shifts.correctionRequested")}</h2>
            <p className="small muted">{t("shifts.correctionHelp")}</p>
          </div>
          <Link className="cta" to={correctionUrl}>
            {t("shifts.editAndResubmit")}
          </Link>
        </section>
      )}
      {canReopen && (
        <section className="card reopen-card">
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <h2>{t("shifts.reopenTitle")}</h2>
              <p className="small muted">{t("shifts.reopenHelp")}</p>
            </div>
            {reopening ? (
              <div className="row reopen-card__reason">
                <input
                  style={{ flex: 1 }}
                  value={reopenReason}
                  placeholder={t("shifts.whatNeedsCorrecting")}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
                <button type="button" disabled={busy} onClick={submitReopen}>
                  {t("common.confirm")}
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => setReopening(false)}
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <div className="row">
                <button type="button" disabled={busy} onClick={() => setReopening(true)}>
                  {t("shifts.reopenForCorrection")}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
