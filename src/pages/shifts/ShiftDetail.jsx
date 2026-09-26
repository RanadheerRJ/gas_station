import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { formatDate } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { useShiftDetail } from "./useShiftDetail.js";
import { useSettledShiftDetail } from "./useSettledShiftDetail.js";
import ReviewBanners from "./ReviewBanners.jsx";
import MeterReadingsCard from "./MeterReadingsCard.jsx";
import SettlementCard from "./SettlementCard.jsx";
import ExpensesTestingCard from "./ExpensesTestingCard.jsx";
import CreditSalesCard from "./CreditSalesCard.jsx";
import ReviewActionBar from "./ReviewActionBar.jsx";

/**
 * A settled shift, as its own screen: the full breakdown a reviewer needs,
 * reached by tapping a row of the shifts list or the attendant's history.
 * Until a shift is approved, a reviewer can correct expenses and testing
 * inline and sign it off from the pinned action bar. The owner can also
 * reopen the whole record for correction — an approved one included.
 */
export default function ShiftDetail() {
  const { t, tn } = useLanguage();
  const {
    station,
    shift,
    customers,
    loading,
    stationsLoading,
    loadError,
    canReview,
    canResubmit,
    canReopen,
    correctionUrl,
    busy,
    error,
    back,
    onRevise,
    onReopen,
    onApprove,
    onReject,
  } = useShiftDetail();

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("shifts.title")} back={back} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <ScreenHeader title={t("shifts.title")} back={back} />
        <div className="content">
          <Notice kind="error">{loadError}</Notice>
        </div>
      </>
    );
  }

  if (!shift) {
    return (
      <>
        <ScreenHeader title={t("shifts.title")} back={back} />
        <div className="content">
          <div className="empty-card">
            <h2>{t("shifts.notFound")}</h2>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={shift.employeeName}
        sub={`${formatDate(shift.date)} · ${tn(
          shift.nozzles.length,
          "shifts.nozzle",
          "shifts.nozzles"
        )}${station ? ` · ${station.name}` : ""}`}
        back={back}
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}
        <SettledShiftDetail
          shift={shift}
          customers={customers}
          canReview={canReview}
          canResubmit={canResubmit}
          correctionUrl={correctionUrl}
          canReopen={canReopen}
          busy={busy}
          onRevise={onRevise}
          onReopen={onReopen}
          onApprove={onApprove}
          onReject={onReject}
        />
      </div>
    </>
  );
}

/**
 * The read-only (and, for a reviewer, correctable) breakdown of a handed-in
 * shift: meter readings, product totals, the settlement walk from gross to
 * cash-over, expenses and testing, credit sales, and the sign-off bar.
 *
 * Also rendered by the attendant's running-shift screen, which passes a
 * shift and no review powers.
 */
export function SettledShiftDetail({
  shift,
  customers = [],
  canReview = false,
  canResubmit = false,
  correctionUrl = "",
  canReopen = false,
  busy = false,
  onRevise,
  onReopen,
  onApprove,
  onReject,
}) {
  const {
    locked,
    editing,
    setEditing,
    expenses,
    setExpenses,
    testing,
    setTesting,
    rejecting,
    setRejecting,
    reason,
    setReason,
    reopening,
    setReopening,
    reopenReason,
    setReopenReason,
    totals,
    draft,
    submitRevision,
    submitRejection,
    submitReopen,
    cancelEditing,
  } = useSettledShiftDetail({ shift, onRevise, onReject, onReopen });

  return (
    <>
      <ReviewBanners
        shift={shift}
        locked={locked}
        canResubmit={canResubmit}
        correctionUrl={correctionUrl}
        canReopen={canReopen}
        busy={busy}
        reopening={reopening}
        setReopening={setReopening}
        reopenReason={reopenReason}
        setReopenReason={setReopenReason}
        submitReopen={submitReopen}
      />

      <div className="detail-grid">
        <MeterReadingsCard totals={totals} />
        <SettlementCard shift={shift} draft={draft} />
      </div>

      <ExpensesTestingCard
        shift={shift}
        totals={totals}
        draft={draft}
        canReview={canReview}
        locked={locked}
        editing={editing}
        setEditing={setEditing}
        expenses={expenses}
        setExpenses={setExpenses}
        testing={testing}
        setTesting={setTesting}
        busy={busy}
        submitRevision={submitRevision}
        cancelEditing={cancelEditing}
      />

      {(shift.creditSales || []).length > 0 && (
        <CreditSalesCard creditSales={shift.creditSales} customers={customers} />
      )}

      {canReview && !locked && (
        <ReviewActionBar
          totals={totals}
          busy={busy}
          rejecting={rejecting}
          setRejecting={setRejecting}
          reason={reason}
          setReason={setReason}
          submitRejection={submitRejection}
          onApprove={onApprove}
        />
      )}
    </>
  );
}
