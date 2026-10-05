import { Navigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import StepProgress from "../../components/StepProgress.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { formatStamp } from "../../lib/format";
import { SHIFT_STATUS, validateClosing } from "../../lib/shiftMath";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { useCloseShiftForm } from "./useCloseShiftForm.js";
import NozzleReadingsSection from "./NozzleReadingsSection.jsx";
import ExpensesSection from "./ExpensesSection.jsx";
import TestingSection from "./TestingSection.jsx";
import CreditSection from "./CreditSection.jsx";
import PaymentsSection from "./PaymentsSection.jsx";
import HandoverSection from "./HandoverSection.jsx";
import CheckSummary from "./CheckSummary.jsx";

/**
 * Closing a shift is a confirmation flow, not a form competing with five
 * other panels: readings, testing, credit, the cash count, and the handover
 * figure — ending in a plain-language summary and one pinned action that
 * submits it all. A sticky progress bar says which step wants attention and
 * fills a check on each one that has something in it (or needs nothing).
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

  // What the progress bar calls "done". Only two steps ever want typing —
  // the closing readings (required) and the cash count — so those are the
  // ones that hold the bar back. The review-only steps (a read-only expense
  // list, testing and credit where "nothing today" is a complete answer,
  // and the computed handover) are done by definition: a check there says
  // "nothing needed here", not "you typed something". Nothing here blocks
  // or enables the submit.
  const withClosings = shift.nozzles.map((nozzle) => ({
    ...nozzle,
    closingReading: closings[nozzle.nozzleId] ?? "",
  }));
  const showExpenses = isCorrection || expenses.length > 0;
  const cashCounted = payments.cash !== "";
  const steps = [
    {
      id: "readings",
      label: t("shifts.closingReadings"),
      done: validateClosing(withClosings).length === 0,
    },
    ...(showExpenses
      ? [{ id: "expenses", label: t("shifts.expensesLogged"), done: true }]
      : []),
    { id: "testing", label: t("shifts.fuelTested"), done: true },
    { id: "credit", label: t("shifts.creditSales"), done: true },
    { id: "payments", label: t("shifts.whatCollected"), done: cashCounted },
    { id: "handover", label: t("shifts.cashToHandOver"), done: cashCounted },
  ];

  // During a correction, the readings each nozzle was submitted with — used
  // only to highlight what has been changed since.
  const originals = isCorrection
    ? Object.fromEntries(
        shift.nozzles.map((nozzle) => [nozzle.nozzleId, nozzle.closingReading])
      )
    : undefined;

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
          <Notice kind="attention">
            <strong>
              {t("shifts.sentBackBy", {
                who: shift.rejectedByName || t("shifts.theOwner"),
              })}
              {shift.rejectionReason ? `: ${shift.rejectionReason}` : ""}
            </strong>{" "}
            {t("close.fixAndResend")}
          </Notice>
        )}
        {error && (
          <Notice kind="error">
            {error}
            <p className="small draft-note">{t("close.draftKept")}</p>
          </Notice>
        )}

        <StepProgress steps={steps} />

        <NozzleReadingsSection
          nozzles={shift.nozzles}
          closings={closings}
          setClosings={setClosings}
          preview={preview}
          originals={originals}
        />

        {showExpenses && (
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
          preview={preview}
        />

        <HandoverSection preview={preview} />

        <CheckSummary preview={preview} creditSales={creditSales} payments={payments} />

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
