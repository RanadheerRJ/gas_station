import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { formatDate, formatStamp, money } from "../../lib/format";
import Money from "../../components/Money.jsx";
import VariancePill from "../../components/VariancePill.jsx";
import { elapsedLabel } from "../../lib/elapsed.js";
import { StatusTag } from "./parts.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { useShiftDetail } from "./useShiftDetail.js";
import { useSettledShiftDetail } from "./useSettledShiftDetail.js";
import ReviewBanners from "./ReviewBanners.jsx";
import ReviewSummaryCard from "./ReviewSummaryCard.jsx";
import MeterReadingsCard from "./MeterReadingsCard.jsx";
import SettlementCard from "./SettlementCard.jsx";
import ExpensesTestingCard from "./ExpensesTestingCard.jsx";
import CreditSalesCard from "./CreditSalesCard.jsx";
import CreditReviewCard from "./CreditReviewCard.jsx";
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
    creditReview,
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
          creditReview={creditReview}
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

/** One receipt section: a card behind a native, keyboard-safe disclosure. */
export function CollapsibleSection({ title, children, testId, defaultOpen = true }) {
  return (
    <details className="shift-collapse" open={defaultOpen} data-testid={testId}>
      <summary className="shift-collapse__summary">
        <span>{title}</span>
        <span className="shift-collapse__chev" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="shift-collapse__body">{children}</div>
    </details>
  );
}

/** Receipt hero: who, how long, and the figures the rest of the page proves. */
export function ShiftHero({ shift, totals }) {
  const { t } = useLanguage();
  const start = shift.startTime?.toDate
    ? shift.startTime.toDate()
    : new Date(shift.startTime);
  const end = shift.endTime
    ? shift.endTime?.toDate
      ? shift.endTime.toDate()
      : new Date(shift.endTime)
    : null;
  const duration =
    end && Number.isFinite(start?.getTime?.()) && Number.isFinite(end?.getTime?.())
      ? elapsedLabel(end - start, t)
      : "";
  return (
    <section className="card shift-hero" data-testid="shift-hero">
      <div className="shift-hero__head">
        <div>
          <h2>{shift.employeeName}</h2>
          <p className="small muted">
            {formatStamp(shift.startTime)}
            {shift.endTime ? ` → ${formatStamp(shift.endTime)}` : ""}
            {duration ? ` · ${t("shifts.duration")}: ${duration}` : ""}
          </p>
        </div>
        <StatusTag status={shift.status} reopened={Boolean(shift.approvedAt)} />
      </div>
      <div className="shift-hero__figures">
        <span>
          <span className="k">{t("shifts.litres")}</span>
          <strong className="mono">{money(totals.totalLitres)} L</strong>
        </span>
        <span>
          <span className="k">{t("shifts.gross")}</span>
          <Money
            kind="neutral"
            value={totals.gross}
            label={t("shifts.gross")}
            size="lg"
          />
        </span>
        <span>
          <span className="k">{t("shifts.net")}</span>
          <Money kind="neutral" value={totals.net} label={t("shifts.net")} size="lg" />
        </span>
        <span>
          <span className="k">{t("shifts.variance")}</span>
          <VariancePill variance={totals.variance} />
        </span>
      </div>
    </section>
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
  creditReview = null,
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
  const { t } = useLanguage();

  return (
    <>
      <ShiftHero shift={shift} totals={totals} />

      {canReview && <ReviewSummaryCard totals={draft} shift={shift} />}

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
        <CollapsibleSection title={t("shifts.meterReadings")}>
          <MeterReadingsCard totals={totals} />
        </CollapsibleSection>
        <CollapsibleSection title={t("shifts.settlement")}>
          <SettlementCard shift={shift} draft={draft} />
        </CollapsibleSection>
      </div>

      {/* A reviewer arrives to correct expenses and testing, so that section
          is already open for them. Everybody else gets the receipts folded
          away and the money-first sections open. */}
      <CollapsibleSection title={t("shifts.expensesAndTesting")} defaultOpen={canReview}>
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
      </CollapsibleSection>

      {canReview && creditReview && (
        <CollapsibleSection title={t("shifts.creditReview")} defaultOpen={false}>
          <CreditReviewCard review={creditReview} />
        </CollapsibleSection>
      )}

      {(shift.creditSales || []).length > 0 && (
        <CollapsibleSection title={t("shifts.creditSalesHeading")} defaultOpen={false}>
          <CreditSalesCard creditSales={shift.creditSales} customers={customers} />
        </CollapsibleSection>
      )}

      {canReview && (
        <ReviewActionBar
          locked={locked}
          totals={draft}
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
