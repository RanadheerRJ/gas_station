import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Field, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import {
  approveShift,
  listCustomers,
  listShifts,
  readableError,
  rejectShift,
  reviseShift,
} from "../../lib/api";
import { formatDate, formatStamp, money } from "../../lib/format";
import {
  PAYMENT_MODES,
  SHIFT_STATUS,
  shiftTotals,
  varianceLabel,
  varianceTone,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { PAYMENT_KEY, VARIANCE_KEY, StatusTag } from "./parts.jsx";
import { shiftPaths } from "./paths.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * A settled shift, as its own screen: the full breakdown a reviewer needs,
 * reached by tapping a row of the shifts list or the attendant's history.
 * Until a shift is approved, a reviewer can correct expenses and testing
 * inline and sign it off from the pinned action bar.
 */
export default function ShiftDetail() {
  const { t, tn } = useLanguage();
  const { id } = useParams();
  const { profile } = useAuth();
  const { station, stationId, link, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);
  const canReview = profile.role === "owner" || profile.role === "manager";

  const [shifts, setShifts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      // The customer directory is a manager/owner read; an attendant's shift
      // shows credit sale names straight off the shift row instead.
      const [rows, directory] = await Promise.all([
        listShifts(stationId),
        profile.role === "attendant"
          ? Promise.resolve([])
          : listCustomers(stationId).catch(() => []),
      ]);
      setShifts(rows);
      setCustomers(directory);
      setLoadError("");
    } catch (err) {
      setLoadError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, profile.role]);

  useEffect(() => {
    load();
  }, [load]);

  const [run, busy, error] = useRunner(load);

  const shift = shifts.find((s) => s.id === id);
  // A sent-back shift belongs to its operator. Give that attendant a direct,
  // explicit way into the correction form; owners and managers retain the
  // review controls below instead.
  const canResubmit =
    profile.role === "attendant" &&
    shift?.status === SHIFT_STATUS.REJECTED &&
    shift.userId === profile.uid;
  // Attendants reach a settled shift from their history list; managers and
  // owners from the shifts list. Either way, the back arrow points at the
  // list that led here.
  const back = link(paths.list);

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
          correctionUrl={canResubmit ? link(paths.correct(shift.id)) : ""}
          busy={busy}
          onRevise={(patch) => run(() => reviseShift(stationId, shift.id, patch))}
          onApprove={() => run(() => approveShift(stationId, shift.id))}
          onReject={(reason) => run(() => rejectShift(stationId, shift.id, reason))}
        />
      </div>
    </>
  );
}

/**
 * The read-only (and, for a reviewer, correctable) breakdown of a handed-in
 * shift: meter readings, product totals, the settlement walk from gross to
 * cash-over, expenses and testing, credit sales, and the sign-off bar.
 */
export function SettledShiftDetail({
  shift,
  customers = [],
  canReview = false,
  canResubmit = false,
  correctionUrl = "",
  busy = false,
  onRevise,
  onApprove,
  onReject,
}) {
  const { t } = useLanguage();
  const locked = shift.status === SHIFT_STATUS.APPROVED;
  const [editing, setEditing] = useState(false);
  const [expenses, setExpenses] = useState(shift.expenses || []);
  const [testing, setTesting] = useState({
    MS: shift.testing?.MS ?? "",
    HSD: shift.testing?.HSD ?? "",
  });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  // Re-sync whenever the shift reloads under us.
  useEffect(() => {
    setExpenses(shift.expenses || []);
    setTesting({ MS: shift.testing?.MS ?? "", HSD: shift.testing?.HSD ?? "" });
    setEditing(false);
  }, [shift]);

  const totals = useMemo(() => shiftTotals(shift), [shift]);
  const draft = useMemo(
    () => (editing ? shiftTotals({ ...shift, expenses, testing }) : totals),
    [editing, shift, expenses, testing, totals]
  );

  const submitRevision = async () => {
    const ok = await onRevise({ expenses, testing });
    if (ok) setEditing(false);
  };

  const submitRejection = async () => {
    const ok = await onReject(reason.trim());
    if (ok) {
      setReason("");
      setRejecting(false);
    }
  };

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

      <div className="detail-grid">
        {/* ---- meter readings & product totals ---- */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.meterReadings")}</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("shifts.nozzleCol")}</th>
                <th className="num">{t("shifts.opening")}</th>
                <th className="num">{t("shifts.closing")}</th>
                <th className="num">{t("shifts.litres")}</th>
                <th className="num">{t("shifts.price")}</th>
                <th className="num">{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((line) => (
                <tr key={line.nozzleId}>
                  <td>
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span
                        className={`fuel-dot fuel-dot--${fuelClass(line.fuelType)}`}
                      />
                      {line.label}
                    </span>
                  </td>
                  <td className="num mono">{money(line.openingReading)}</td>
                  <td className="num mono">{money(line.closingReading)}</td>
                  <td className="num mono">{money(line.litresSold)}</td>
                  <td className="num mono">{money(line.price)}</td>
                  <td className="num mono">{money(line.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{t("common.total")}</td>
                <td className="num mono">{money(totals.totalLitres)}</td>
                <td />
                <td className="num mono">{money(totals.gross)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="card__foot">
            <table>
              <tbody>
                <tr>
                  <td>{t("shifts.msPetrol")}</td>
                  <td className="num mono">{money(totals.litresByGroup.MS)} L</td>
                </tr>
                <tr>
                  <td>{t("shifts.hsdDiesel")}</td>
                  <td className="num mono">{money(totals.litresByGroup.HSD)} L</td>
                </tr>
                {totals.litresByGroup.OTHER > 0 && (
                  <tr>
                    <td>{t("shifts.other")}</td>
                    <td className="num mono">{money(totals.litresByGroup.OTHER)} L</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- the settlement walk ---- */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.settlement")}</h2>
            <StatusTag status={shift.status} />
          </div>
          <table>
            <tbody>
              <tr>
                <td>{t("shifts.grossSales")}</td>
                <td className="num mono">{money(draft.gross)}</td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.testingMs")}</td>
                <td className="num mono">−{money(draft.testingMS)}</td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.testingHsd")}</td>
                <td className="num mono">−{money(draft.testingHSD)}</td>
              </tr>
              <tr>
                <td className="muted">{t("ledger.expenses")}</td>
                <td className="num mono">−{money(draft.expensesTotal)}</td>
              </tr>
              <tr className="total">
                <td>{t("shifts.netDue")}</td>
                <td className="num mono">{money(draft.net)}</td>
              </tr>
              {PAYMENT_MODES.map((mode) => (
                <tr key={mode}>
                  <td className="muted">{t(PAYMENT_KEY[mode])}</td>
                  <td className="num mono">{money(draft.payments[mode])}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t("shifts.collected")}</td>
                <td className="num mono">{money(draft.declared)}</td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.lessCardUpiCredit")}</td>
                <td className="num mono">−{money(draft.nonCash)}</td>
              </tr>
              <tr className="total">
                <td>{t("shifts.cashToOwner")}</td>
                <td className="num mono">{money(draft.handover)}</td>
              </tr>
              <tr className="total">
                <td>
                  {t("shifts.varianceLabelled", {
                    label: t(VARIANCE_KEY[varianceLabel(draft.variance)]),
                  })}
                </td>
                <td
                  className="num mono"
                  style={{
                    color:
                      varianceTone(draft.variance) === "neg"
                        ? "var(--rust)"
                        : "var(--green)",
                  }}
                >
                  {money(draft.variance)}
                </td>
              </tr>
            </tbody>
          </table>
          {(shift.note || shift.endTime) && (
            <div className="card__foot small">
              {shift.note && (
                <div>
                  <span className="muted">{t("shifts.noteLabel")} </span>
                  {shift.note}
                </div>
              )}
              <div className="muted">
                {t("shifts.closedByLine", {
                  who: shift.closedByName || shift.employeeName,
                })}
                {shift.endTime ? ` · ${formatStamp(shift.endTime)}` : ""}
                {shift.revisedByName
                  ? ` · ${t("shifts.revisedBy", { who: shift.revisedByName })}`
                  : ""}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ---- expenses & testing: editable until approved ---- */}
      {editing ? (
        <section className="card">
          <div className="stack" style={{ gap: 14 }}>
            <div className="between">
              <h2>{t("shifts.expensesAndTesting")}</h2>
              <span className="small muted mono">
                −{money(draft.expensesTotal + draft.testingTotal)}
              </span>
            </div>
            <div className="panel flush">
              <table>
                <tbody>
                  {expenses.map((row, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          value={row.label}
                          placeholder="Power bill"
                          onChange={(e) =>
                            setExpenses((rows) => {
                              const next = [...rows];
                              next[index] = { ...next[index], label: e.target.value };
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="num" style={{ width: 150 }}>
                        <input
                          className="mono"
                          inputMode="decimal"
                          style={{ textAlign: "right" }}
                          value={row.amount}
                          placeholder="0.00"
                          onChange={(e) =>
                            setExpenses((rows) => {
                              const next = [...rows];
                              next[index] = { ...next[index], amount: e.target.value };
                              return next;
                            })
                          }
                        />
                      </td>
                      <td style={{ width: 40 }}>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() =>
                            setExpenses((rows) => rows.filter((_, j) => j !== index))
                          }
                        >
                          {t("common.remove")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="small"
                onClick={() =>
                  setExpenses((rows) => [...rows, { label: "", amount: "" }])
                }
              >
                {t("shifts.addExpense")}
              </button>
            </div>
            <div className="form-grid">
              <Field label={t("shifts.testingMs")} hint="₹">
                <input
                  className="mono"
                  inputMode="decimal"
                  style={{ textAlign: "right" }}
                  value={testing.MS}
                  placeholder="0.00"
                  onChange={(e) =>
                    setTesting((prev) => ({ ...prev, MS: e.target.value }))
                  }
                />
              </Field>
              <Field label={t("shifts.testingHsd")} hint="₹">
                <input
                  className="mono"
                  inputMode="decimal"
                  style={{ textAlign: "right" }}
                  value={testing.HSD}
                  placeholder="0.00"
                  onChange={(e) =>
                    setTesting((prev) => ({ ...prev, HSD: e.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="row">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={submitRevision}
              >
                {busy ? t("common.saving") : t("shifts.saveChanges")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setExpenses(shift.expenses || []);
                  setTesting({
                    MS: shift.testing?.MS ?? "",
                    HSD: shift.testing?.HSD ?? "",
                  });
                  setEditing(false);
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.expensesAndTesting")}</h2>
            {!locked && canReview && (
              <button type="button" className="small" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </button>
            )}
          </div>
          <table>
            <tbody>
              {(shift.expenses || []).map((expense, index) => (
                <tr key={index}>
                  <td>{expense.label || "—"}</td>
                  <td className="num mono">{money(expense.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="muted">{t("shifts.testingMs")}</td>
                <td className="num mono">{money(totals.testingMS)}</td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.testingHsd")}</td>
                <td className="num mono">{money(totals.testingHSD)}</td>
              </tr>
              <tr className="total">
                <td>{t("shifts.totalDeducted")}</td>
                <td className="num mono">
                  {money(totals.expensesTotal + totals.testingTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {(shift.creditSales || []).length > 0 && (
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.creditSalesHeading")}</h2>
          </div>
          <table>
            <tbody>
              {shift.creditSales.map((sale, index) => {
                const known = customers.find((c) => c.id === sale.customerId);
                return (
                  <tr key={index}>
                    <td>{known?.name || sale.name || t("shifts.walkIn")}</td>
                    <td className="mono small muted">
                      {sale.phone || known?.phone || "—"}
                    </td>
                    <td className="num mono">{money(sale.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* ---- the sign-off bar ---- */}
      {canReview && !locked && (
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
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting((v) => !v)}
              >
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
      )}
    </>
  );
}
