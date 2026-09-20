import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Field, Notice } from "../../components/ui.jsx";
import { LoadingPanels, NumberRoll } from "../../components/motion.jsx";
import { CashIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { closeShift, listCustomers, listShifts, readableError } from "../../lib/api";
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
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Closing a shift is a confirmation flow, not a form competing with five
 * other panels: readings, testing, credit, the cash count, and the handover
 * figure — ending in one pinned action that submits it all.
 *
 * The same screen serves the attendant closing their own shift and a
 * manager/owner closing anyone's; the only difference is that the attendant
 * cannot attribute credit sales (the directory is not theirs to read, and
 * the RPC refuses those rows anyway).
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

  const canEnterCredit = profile.role !== "attendant";

  const [closings, setClosings] = useState({});
  const [creditSales, setCreditSales] = useState([]);
  const [payments, setPayments] = useState({
    cash: "",
    card: "",
    upi: "",
    credit: "",
    other: "",
  });
  const [testing, setTesting] = useState({ MS: "", HSD: "" });
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!stationId) return;
      setLoading(true);
      try {
        const [rows, directory] = await Promise.all([
          listShifts(stationId),
          canEnterCredit ? listCustomers(stationId).catch(() => []) : Promise.resolve([]),
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
  }, [stationId, id, canEnterCredit]);

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

  // Expenses were logged during the shift and are not re-entered here.
  const expenses = useMemo(() => shift?.expenses || [], [shift]);

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
  }, [creditTotal]);

  const visibleModes = useMemo(
    () =>
      canEnterCredit ? PAYMENT_MODES : PAYMENT_MODES.filter((mode) => mode !== "credit"),
    [canEnterCredit]
  );

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
      await closeShift(stationId, shift.id, {
        closingReadings: Object.fromEntries(
          withClosings.map((nozzle) => [nozzle.nozzleId, nozzle.closingReading])
        ),
        // Never send credit rows the operator was not allowed to enter; the
        // database refuses them anyway.
        creditSales: canEnterCredit ? creditSales : [],
        payments: canEnterCredit ? payments : { ...payments, credit: "" },
        testing,
        note,
      });
      // Home, with the shift now sitting in history / the review queue.
      navigate(paths.home, { replace: true });
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

  // Already closed, or never ours to close — nothing to do here.
  if (!shift || shift.status !== SHIFT_STATUS.OPEN) {
    return <Navigate to={paths.home} replace />;
  }

  return (
    <>
      <ScreenHeader
        title={t("shifts.closeTitle", { name: shift.employeeName })}
        sub={`${t("shifts.started")} ${formatStamp(shift.startTime)} · ${t(
          "shifts.closeNote"
        )}`}
        back={backTarget(paths, id)}
      />
      <div className="content stack">
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

        {/* ---- expenses already logged ---- */}
        {expenses.length > 0 && (
          <section className="card card--flush">
            <div className="card__head">
              <h2>{t("shifts.expensesLogged")}</h2>
              <span className="small muted mono">−₹ {money(preview.expensesTotal)}</span>
            </div>
            <div>
              {expenses.map((expense, index) => (
                <div key={index} className="closing-row closing-row--flat">
                  <span className="closing-row__label">{expense.label}</span>
                  <span className="closing-row__out mono">₹ {money(expense.amount)}</span>
                </div>
              ))}
            </div>
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
        {canEnterCredit ? (
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
        ) : (
          <Notice>{t("shifts.creditByManager")}</Notice>
        )}

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
          <button type="button" disabled={busy} onClick={() => navigate(-1)}>
            {t("common.cancel")}
          </button>
          <button type="button" className="cta" disabled={busy} onClick={submit}>
            {busy ? t("shifts.submitting") : t("shifts.closeAndSend")}
          </button>
        </ActionBar>
      </div>
    </>
  );
}

/** Where the back arrow points: the running shift for an attendant, the list otherwise. */
function backTarget(paths, id) {
  if (paths.run) return { to: paths.run(id) };
  return { to: paths.list };
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
