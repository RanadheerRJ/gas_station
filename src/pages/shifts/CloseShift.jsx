import { Navigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { formatStamp } from "../../lib/format";
import { SHIFT_STATUS } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { useCloseShiftForm } from "./useCloseShiftForm.js";
import NozzleReadingsSection from "./NozzleReadingsSection.jsx";
import ExpensesSection from "./ExpensesSection.jsx";
import TestingSection from "./TestingSection.jsx";
import CreditSection from "./CreditSection.jsx";
import PaymentsSection from "./PaymentsSection.jsx";
import HandoverSection from "./HandoverSection.jsx";

/**
 * Closing a shift is a confirmation flow, not a form competing with five
 * other panels: readings, testing, credit, the cash count, and the handover
 * figure — ending in one pinned action that submits it all.
 *
 * The same screen serves the attendant closing their own shift and a
 * manager/owner closing anyone's. Everyone can record credit sales —
 * against an existing customer (picked from the balance-free directory) or
 * a new walk-in — because they all land inside close_shift's single
 * transaction and the shift still goes to the owner/manager for review.
 *
 * A sent-back shift reuses this screen for its correction: once by its own
 * attendant, and again by an owner who has reopened the shift — both walk
 * the same pre-filled form and resubmit through the reconciling RPC.
 *
 * Every figure, effect and rule behind the screen lives in
 * useCloseShiftForm; this file decides only what is drawn and in what order.
 */
export default function CloseShift() {
  const { t } = useLanguage();
  const {
    navigate,
    paths,
    shift,
    customers,
    loading,
    stationsLoading,
    loadError,
    isCorrection,
    closings,
    setClosings,
    creditSales,
    setCreditSales,
    payments,
    setPayments,
    testing,
    setTesting,
    note,
    setNote,
    setEditedExpenses,
    expenses,
    preview,
    problems,
    busy,
    error,
    submit,
    fallbackBack,
    back,
  } = useCloseShiftForm();

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("shifts.closeShift")} back={fallbackBack} />
        <div className="content">
          <LoadingPanels count={2} lines={4} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <ScreenHeader title={t("shifts.closeShift")} back={fallbackBack} />
        <div className="content">
          <Notice kind="error">{loadError}</Notice>
        </div>
      </>
    );
  }

  // A sent-back shift is the one closed state its own attendant — or the
  // owner who reopened it — may correct here. Every other settled state
  // stays immutable: an owner reopens such a shift from its detail screen
  // first, which never re-runs it or reclaims a nozzle.
  if (!shift || (shift.status !== SHIFT_STATUS.OPEN && !isCorrection)) {
    return <Navigate to={paths.home} replace />;
  }

  return (
    <>
      <ScreenHeader
        title={
          isCorrection
            ? t("shifts.correctTitle", { name: shift.employeeName })
            : t("shifts.closeTitle", { name: shift.employeeName })
        }
        sub={
          isCorrection
            ? t("shifts.correctionHelp")
            : `${t("shifts.started")} ${formatStamp(shift.startTime)} · ${t(
                "shifts.closeNote"
              )}`
        }
        back={back}
      />
      <div className="content stack">
        {isCorrection && (
          <Notice kind="error">
            {t("shifts.sentBackBy", {
              who: shift.rejectedByName || t("shifts.theOwner"),
            })}
            {shift.rejectionReason ? `: ${shift.rejectionReason}` : ""}
          </Notice>
        )}
        {error && <Notice kind="error">{error}</Notice>}

        <NozzleReadingsSection
          nozzles={shift.nozzles}
          closings={closings}
          setClosings={setClosings}
          preview={preview}
        />

        {(isCorrection || expenses.length > 0) && (
          <ExpensesSection
            isCorrection={isCorrection}
            expenses={expenses}
            setEditedExpenses={setEditedExpenses}
            expensesTotal={preview.expensesTotal}
          />
        )}

        <TestingSection testing={testing} setTesting={setTesting} />

        <CreditSection
          creditSales={creditSales}
          setCreditSales={setCreditSales}
          customers={customers}
        />

        <PaymentsSection
          payments={payments}
          setPayments={setPayments}
          note={note}
          setNote={setNote}
        />

        <HandoverSection preview={preview} />

        {problems.length > 0 && (
          <Notice kind="error">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </Notice>
        )}

        <ActionBar>
          {/* Same explicit target as the back arrow: from a deep link or a
              refresh there is no in-app history, and navigate(-1) would walk
              straight out of the app. */}
          <button type="button" disabled={busy} onClick={() => navigate(back)}>
            {t("common.cancel")}
          </button>
          <button type="button" className="cta" disabled={busy} onClick={submit}>
            {busy
              ? t(isCorrection ? "shifts.resubmitting" : "shifts.submitting")
              : t(isCorrection ? "shifts.resubmitForReview" : "shifts.closeAndSend")}
          </button>
        </ActionBar>
      </div>
    </>
  );
}
