import { useState } from "react";
import Sheet from "../../components/Sheet.jsx";
import { useOneShot, prefersReducedMotion } from "../../components/motion.jsx";
import { addShiftExpense, removeShiftExpense } from "../../lib/api";
import { money, num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Log money paid out of the drawer, as it happens, in a sheet over whatever
 * screen you were on. Closing a shift then needs only readings and a cash
 * count — the drawer's story was written as it happened.
 *
 * Mutations go through the same RPCs the old inline editor used; only the
 * presentation moved into a sheet so the shift screens stay focused.
 */
export default function ExpensesSheet({ open, onClose, shift, stationId, onChange }) {
  const { t } = useLanguage();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejects, setRejects] = useState(0);
  // The row being removed is held for the length of its collapse so the rows
  // below slide up instead of jumping.
  const [removing, setRemoving] = useState(null);
  const amountShake = useOneShot(rejects, { className: "shake" });

  const rows = shift?.expenses || [];
  const total = rows.reduce((sum, expense) => sum + num(expense.amount), 0);
  const ready = label.trim() && num(amount) > 0;

  const reset = () => {
    setLabel("");
    setAmount("");
  };

  const submit = async () => {
    if (!ready || busy || !shift) {
      setRejects((count) => count + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addShiftExpense(stationId, shift.id, {
        label: label.trim(),
        amount: num(amount),
      });
      reset();
      await onChange();
    } catch (err) {
      setError(err?.message || "Could not save the expense.");
      setRejects((count) => count + 1);
    } finally {
      setBusy(false);
    }
  };

  // Expenses are keyed by position, so the collapse must finish before the
  // row leaves the array or the wrong row would animate.
  const remove = async (index) => {
    if (busy) return;
    if (prefersReducedMotion()) {
      setBusy(true);
      try {
        await removeShiftExpense(stationId, shift.id, index);
        await onChange();
      } catch (err) {
        setError(err?.message || "Could not remove the expense.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setRemoving(index);
    setBusy(true);
    try {
      await removeShiftExpense(stationId, shift.id, index);
      await onChange();
    } catch (err) {
      setError(err?.message || "Could not remove the expense.");
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t("shifts.drawerExpenses")}
    >
      <div className="stack" style={{ gap: 14 }}>
        {rows.length > 0 && (
          <div className="expense-list">
            {rows.map((expense, index) => (
              <div
                key={index}
                className={`expense-row${removing === index ? " row-exit" : " row-enter"}`}
              >
                <span className="expense-row__label">{expense.label}</span>
                <span className="expense-row__amount mono">{money(expense.amount)}</span>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => remove(index)}
                >
                  {t("common.remove")}
                </button>
              </div>
            ))}
            <div className="expense-row expense-row--total">
              <span className="expense-row__label">{t("common.total")}</span>
              <span className="expense-row__amount mono">{money(total)}</span>
              <span />
            </div>
          </div>
        )}

        {error && <div className="notice error">{error}</div>}

        <div className="sheet-form">
          <label className="field">
            <span>{t("shifts.whatPaidFor")}</span>
            <input
              value={label}
              disabled={busy}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("shifts.whatPaidFor")}
            />
          </label>
          <label className="field">
            <span>{t("common.amount")} · ₹</span>
            <input
              className={`mono ${amountShake}`.trim()}
              inputMode="decimal"
              style={{ textAlign: "right" }}
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="0.00"
            />
          </label>
        </div>

        <button type="button" className="cta" disabled={busy || !ready} onClick={submit}>
          {busy ? t("common.saving") : t("shifts.addExpense")}
        </button>
      </div>
    </Sheet>
  );
}
