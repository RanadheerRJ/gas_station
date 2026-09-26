import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Field, Notice } from "../../components/ui.jsx";
import { LoadingPanels, NumberRoll } from "../../components/motion.jsx";
import { CashIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import {
  closeShift,
  listCustomerDirectory,
  listShifts,
  readableError,
  resubmitRejectedShift,
} from "../../lib/api";
import { formatStamp, money, num } from "../../lib/format";
import {
  PAYMENT_MODES,
  SHIFT_STATUS,
  VARIANCE_TOLERANCE,
  litresBetween,
  shiftTotals,
  validateClosing,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { paymentLabel } from "./parts.jsx";
import { shiftPaths } from "./paths.js";
import { useDraft } from "../../state/useDraft.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

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
 */
export default function CloseShift() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { stationId, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);

  const [shift, setShift] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Everything typed here was read off a meter or counted at the till —
  // work that cannot be re-derived if the phone dies or the submit fails.
  // Drafts mirror it into localStorage, keyed per shift, until the close or
  // correction resubmission goes through.
  const [closings, setClosings, clearClosings] = useDraft(`close:${id}:readings`, {});
  const [creditSales, setCreditSales, clearCredit] = useDraft(`close:${id}:credit`, []);
  const [payments, setPayments, clearPayments] = useDraft(`close:${id}:payments`, {
    cash: "",
    card: "",
    upi: "",
    credit: "",
    other: "",
  });
  const [testing, setTesting, clearTesting] = useDraft(`close:${id}:testing`, {
    MS: "",
    HSD: "",
  });
  const [note, setNote, clearNote] = useDraft(`close:${id}:note`, "");
  const [editedExpenses, setEditedExpenses, clearEditedExpenses] = useDraft(
    `close:${id}:expenses`,
    []
  );
  // `useDraft` deliberately keeps partially corrected data on a refresh. This
  // ref only seeds fields from the rejected shift once, when no such draft is
  // present, rather than overwriting work the attendant has already typed.
  const correctionSeededFor = useRef("");
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A sent-back shift is corrected by its own attendant — or, when an owner
  // has reopened it, by that owner. Both get the same pre-filled form and
  // both resubmit through the one RPC that reconciles the whole shift.
  const isCorrection =
    shift?.status === SHIFT_STATUS.REJECTED &&
    ((profile.role === "attendant" && shift.userId === profile.uid) ||
      profile.role === "owner");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!stationId) return;
      setLoading(true);
      try {
        const [rows, directory] = await Promise.all([
          listShifts(stationId),
          listCustomerDirectory(stationId).catch(() => []),
        ]);
        if (cancelled) return;
        setShift(rows.find((s) => s.id === id) || null);
        setCustomers(directory);
        setLoadError("");
      } catch (err) {
        if (!cancelled) setLoadError(readableError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stationId, id]);

  // A shift that is positively known to be settled has no draft worth
  // keeping — someone else closed it, or an earlier submit landed after
  // all. A rejected shift is the exception: it is deliberately reopened for
  // its attendant to correct, so its locally saved corrections must survive.
  // A shift that merely FAILED to load is different: drafts stay because the
  // readings may still be needed once the network returns.
  useEffect(() => {
    if (
      loading ||
      !shift ||
      shift.status === SHIFT_STATUS.OPEN ||
      shift.status === SHIFT_STATUS.REJECTED
    )
      return;
    clearClosings();
    clearCredit();
    clearPayments();
    clearTesting();
    clearNote();
    clearEditedExpenses();
  }, [
    loading,
    shift,
    clearClosings,
    clearCredit,
    clearPayments,
    clearTesting,
    clearNote,
    clearEditedExpenses,
  ]);

  // Start a correction with the submitted values, so whoever is correcting
  // — the attendant, or an owner who reopened the shift — fixes the flagged
  // items rather than re-entering the whole shift.
  useEffect(() => {
    if (!isCorrection || correctionSeededFor.current === id) return;
    correctionSeededFor.current = id;

    setClosings((current) =>
      Object.keys(current).length > 0
        ? current
        : Object.fromEntries(
            shift.nozzles.map((nozzle) => [nozzle.nozzleId, nozzle.closingReading ?? ""])
          )
    );
    setCreditSales((current) =>
      current.length > 0
        ? current
        : (shift.creditSales || []).map((sale) => ({ ...sale }))
    );
    setPayments((current) =>
      Object.values(current).some((value) => value !== "")
        ? current
        : { cash: "", card: "", upi: "", credit: "", other: "", ...shift.payments }
    );
    setTesting((current) =>
      Object.values(current).some((value) => value !== "")
        ? current
        : { MS: "", HSD: "", ...shift.testing }
    );
    setNote((current) => (current !== "" ? current : shift.note || ""));
    setEditedExpenses((current) =>
      current.length > 0
        ? current
        : (shift.expenses || []).map((expense) => ({ ...expense }))
    );
  }, [
    id,
    isCorrection,
    setClosings,
    setCreditSales,
    setPayments,
    setTesting,
    setNote,
    setEditedExpenses,
    shift,
  ]);

  const withClosings = useMemo(
    () =>
      shift
        ? shift.nozzles.map((nozzle) => ({
            ...nozzle,
            closingReading: closings[nozzle.nozzleId] ?? "",
          }))
        : [],
    [shift, closings]
  );

  // Ordinary closes show the expenses recorded while the shift was open. A
  // sent-back shift lets its own attendant correct that list before it goes
  // back to review.
  const expenses = useMemo(
    () => (isCorrection ? editedExpenses : shift?.expenses || []),
    [isCorrection, editedExpenses, shift]
  );

  const preview = useMemo(
    () =>
      shiftTotals({
        nozzles: withClosings,
        expenses,
        creditSales,
        payments,
        testing,
      }),
    [withClosings, expenses, creditSales, payments, testing]
  );

  // Credit taken this shift is a payment mode too — keep the two in step so
  // the operator isn't asked for the same figure twice.
  const creditTotal = creditSales.reduce((sum, sale) => sum + num(sale.amount), 0);
  useEffect(() => {
    setPayments((current) => ({
      ...current,
      credit: creditTotal ? String(creditTotal) : "",
    }));
    // setPayments is a stable useState setter under the hood; listed only to
    // satisfy exhaustive-deps now that it comes from useDraft.
  }, [creditTotal, setPayments]);

  const visibleModes = PAYMENT_MODES;

  const submit = async () => {
    const found = validateClosing(withClosings);
    if (found.length) {
      setProblems(found);
      return;
    }
    setProblems([]);
    setBusy(true);
    setError("");
    try {
      const payload = {
        closingReadings: Object.fromEntries(
          withClosings.map((nozzle) => [nozzle.nozzleId, nozzle.closingReading])
        ),
        creditSales,
        payments,
        testing,
        note,
        expenses,
      };
      if (isCorrection) {
        await resubmitRejectedShift(stationId, shift.id, payload);
      } else {
        await closeShift(stationId, shift.id, payload);
      }
      // The figures are safely in the database — the drafts must go NOW,
      // before navigation, or they would greet the next visit to this URL.
      clearClosings();
      clearCredit();
      clearPayments();
      clearTesting();
      clearNote();
      clearEditedExpenses();
      // A corrected shift returns to its detail so the attendant can confirm
      // that it is back in the review queue. A newly closed shift still goes
      // home, where it sits in history.
      navigate(isCorrection ? paths.detail(shift.id) : paths.home, { replace: true });
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  };

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("shifts.closeShift")} back={backTarget(paths, id)} />
        <div className="content">
          <LoadingPanels count={2} lines={4} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <ScreenHeader title={t("shifts.closeShift")} back={backTarget(paths, id)} />
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

  const back = isCorrection ? paths.detail(id) : backTarget(paths, id);

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

        {/* ---- closing readings ---- */}
        <section className="card card--flush">
          <div className="card__head">
            <h2>{t("shifts.closingReadings")}</h2>
            <span className="small muted mono">
              {money(preview.totalLitres)} L · ₹ {money(preview.gross)}
            </span>
          </div>
          <div>
            {shift.nozzles.map((nozzle) => {
              const typed = closings[nozzle.nozzleId] ?? "";
              const litres =
                typed === "" ? null : litresBetween(nozzle.openingReading, typed);
              const below = typed !== "" && num(typed) < num(nozzle.openingReading);
              return (
                <div key={nozzle.nozzleId} className="closing-row">
                  <span className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`} />
                  <span className="closing-row__label">
                    {nozzle.label}
                    <span className="muted small">{nozzle.fuelType}</span>
                  </span>
                  <span className="closing-row__opening mono muted small">
                    {money(nozzle.openingReading)}
                  </span>
                  <span className="closing-row__out mono small">
                    {litres == null ? "—" : `${money(litres)} L`}
                  </span>
                  <input
                    className={`mono closing-row__input${below ? " input-bad" : ""}`}
                    inputMode="decimal"
                    style={{ textAlign: "right" }}
                    value={typed}
                    onChange={(e) =>
                      setClosings((current) => ({
                        ...current,
                        [nozzle.nozzleId]: e.target.value,
                      }))
                    }
                    placeholder={money(nozzle.openingReading)}
                    aria-label={`${nozzle.label} · ${t("shifts.closing")}`}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- expenses logged during the shift ---- */}
        {(isCorrection || expenses.length > 0) && (
          <section className="card card--flush">
            <div className="card__head">
              <h2>{t("shifts.expensesLogged")}</h2>
              <span className="small muted mono">−₹ {money(preview.expensesTotal)}</span>
            </div>
            {isCorrection ? (
              <div className="stack" style={{ gap: 10, padding: 14 }}>
                {expenses.map((expense, index) => {
                  const patch = (fields) =>
                    setEditedExpenses((rows) => {
                      const next = [...rows];
                      next[index] = { ...next[index], ...fields };
                      return next;
                    });
                  return (
                    <div key={index} className="credit-row">
                      <input
                        value={expense.label || ""}
                        placeholder={t("shifts.whatPaidFor")}
                        onChange={(e) => patch({ label: e.target.value })}
                      />
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{ textAlign: "right" }}
                        value={expense.amount ?? ""}
                        placeholder="0.00"
                        aria-label={t("common.amount")}
                        onChange={(e) => patch({ amount: e.target.value })}
                      />
                      <button
                        type="button"
                        className="quiet"
                        onClick={() =>
                          setEditedExpenses((rows) =>
                            rows.filter((_, item) => item !== index)
                          )
                        }
                      >
                        {t("common.remove")}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="small"
                  onClick={() =>
                    setEditedExpenses((rows) => [...rows, { label: "", amount: "" }])
                  }
                >
                  {t("shifts.addExpense")}
                </button>
              </div>
            ) : (
              <div>
                {expenses.map((expense, index) => (
                  <div key={index} className="closing-row closing-row--flat">
                    <span className="closing-row__label">{expense.label}</span>
                    <span className="closing-row__out mono">
                      ₹ {money(expense.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---- daily testing ---- */}
        <section className="card">
          <div className="card__head">
            <h2>{t("shifts.fuelTested")}</h2>
            <span className="small muted">
              {t("shifts.backInTank")} · ₹ {money(num(testing.MS) + num(testing.HSD))}
            </span>
          </div>
          <div className="form-grid">
            <Field label={t("shifts.msPetrol")} hint="₹">
              <input
                className="mono"
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={testing.MS}
                placeholder="0.00"
                onChange={(e) => setTesting((prev) => ({ ...prev, MS: e.target.value }))}
              />
            </Field>
            <Field label={t("shifts.hsdDiesel")} hint="₹">
              <input
                className="mono"
                inputMode="decimal"
                style={{ textAlign: "right" }}
                value={testing.HSD}
                placeholder="0.00"
                onChange={(e) => setTesting((prev) => ({ ...prev, HSD: e.target.value }))}
              />
            </Field>
          </div>
        </section>

        {/* ---- credit sales ---- */}
        <section className="card">
          <div className="card__head">
            <h2>{t("shifts.creditSales")}</h2>
            <button
              type="button"
              className="small"
              onClick={() =>
                setCreditSales((rows) => [
                  ...rows,
                  { customerId: "", name: "", phone: "", amount: "" },
                ])
              }
            >
              {t("shifts.addCreditSale")}
            </button>
          </div>
          {creditSales.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              {t("common.none")}
            </p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {creditSales.map((row, index) => {
                const known = customers.find((c) => c.id === row.customerId);
                const patch = (fields) =>
                  setCreditSales((rows) => {
                    const next = [...rows];
                    next[index] = { ...next[index], ...fields };
                    return next;
                  });
                return (
                  <div key={index} className="credit-row">
                    <select
                      value={row.customerId || ""}
                      onChange={(e) => {
                        const chosen = customers.find((c) => c.id === e.target.value);
                        patch({
                          customerId: e.target.value,
                          name: chosen ? chosen.name : row.name,
                          phone: chosen ? chosen.phone || "" : row.phone,
                        });
                      }}
                    >
                      <option value="">{t("shifts.newWalkIn")}</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={row.name || ""}
                      disabled={!!known}
                      placeholder={t("shifts.customerName")}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                    <input
                      className="mono"
                      inputMode="tel"
                      value={row.phone || ""}
                      disabled={!!known}
                      placeholder={t("shifts.mobile")}
                      onChange={(e) => patch({ phone: e.target.value })}
                    />
                    <input
                      className="mono"
                      inputMode="decimal"
                      style={{ textAlign: "right" }}
                      value={row.amount}
                      placeholder="0.00"
                      onChange={(e) => patch({ amount: e.target.value })}
                      aria-label={t("common.amount")}
                    />
                    <button
                      type="button"
                      className="quiet"
                      onClick={() =>
                        setCreditSales((rows) => rows.filter((_, j) => j !== index))
                      }
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                );
              })}
              <div className="small muted">{t("shifts.walkInNote")}</div>
            </div>
          )}
        </section>

        {/* ---- the cash count ---- */}
        <section className="card">
          <div className="card__head">
            <h2>{t("shifts.whatCollected")}</h2>
            <CashIcon size={16} />
          </div>
          <div className="form-grid">
            {visibleModes.map((mode) => (
              <Field
                key={mode}
                label={paymentLabel(mode, t)}
                hint={mode === "credit" ? t("shifts.fromListAbove") : undefined}
              >
                <input
                  className="mono"
                  inputMode="decimal"
                  style={{ textAlign: "right" }}
                  value={payments[mode]}
                  readOnly={mode === "credit"}
                  onChange={(e) =>
                    setPayments((current) => ({ ...current, [mode]: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </Field>
            ))}
            <Field label={t("common.note")} hint={t("common.optional")}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Meter 2 sticking"
              />
            </Field>
          </div>
        </section>

        {/* ---- the figure that matters at the counter ---- */}
        <section className="card handover">
          <table>
            <tbody>
              <tr>
                <td>{t("shifts.fuelSold")}</td>
                <td className="num mono">{money(preview.gross)}</td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.lessTesting")}</td>
                <td className="num mono">−{money(preview.testingTotal)}</td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.lessExpenses")}</td>
                <td className="num mono">−{money(preview.expensesTotal)}</td>
              </tr>
              <tr className="total">
                <td>{t("shifts.netDue")}</td>
                <td className="num mono">
                  <NumberRoll value={preview.net} format={money} />
                </td>
              </tr>
              <tr>
                <td className="muted">{t("shifts.lessNonCash")}</td>
                <td className="num mono">−{money(preview.nonCash)}</td>
              </tr>
              <tr className="total handover__cash">
                <td>{t("shifts.cashToHandOver")}</td>
                <td className="num mono">
                  <NumberRoll value={preview.handover} format={money} />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="between handover__verdict">
            <span className="small muted">
              {t("shifts.countedAgainst", {
                counted: money(preview.declared ?? 0),
                due: money(preview.net),
              })}
            </span>
            <Verdict totals={preview} />
          </div>
        </section>

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

/** Where the back arrow points: the running shift for an attendant, the list otherwise. */
function backTarget(paths, id) {
  return paths.run ? paths.run(id) : paths.list;
}

function Verdict({ totals }) {
  const { t } = useLanguage();
  const short = num(totals.variance) < -VARIANCE_TOLERANCE;
  const over = num(totals.variance) > VARIANCE_TOLERANCE;
  return (
    <span
      className="small mono"
      style={{
        color: short ? "var(--rust)" : over ? "var(--green)" : "var(--muted)",
        fontWeight: 650,
      }}
    >
      {short
        ? t("shifts.shortBy", { amount: money(Math.abs(totals.variance)) })
        : over
          ? t("shifts.overBy", { amount: money(totals.variance) })
          : t("shifts.balanced")}
    </span>
  );
}
