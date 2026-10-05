import Money from "../../components/Money.jsx";
import { Field } from "../../components/ui.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Expenses and testing fuel: read-only once approved, correctable by a
 * reviewer before that. Both shapes live here because they are the same
 * panel in two states, and the reviewer toggles between them in place.
 */
export default function ExpensesTestingCard({
  shift,
  totals,
  draft,
  canReview,
  locked,
  editing,
  setEditing,
  expenses,
  setExpenses,
  testing,
  setTesting,
  busy,
  submitRevision,
  cancelEditing,
}) {
  const { t } = useLanguage();

  if (editing) {
    return (
      <section className="card">
        <div className="stack" style={{ gap: 14 }}>
          <div className="between">
            <h2>{t("shifts.expensesAndTesting")}</h2>
            <Money
              kind="out"
              value={draft.expensesTotal + draft.testingTotal}
              label={t("shifts.totalDeducted")}
            />
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
              onClick={() => setExpenses((rows) => [...rows, { label: "", amount: "" }])}
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
                onChange={(e) => setTesting((prev) => ({ ...prev, MS: e.target.value }))}
              />
            </Field>
            <Field label={t("shifts.testingHsd")} hint="₹">
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
          <div className="row">
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={submitRevision}
            >
              {busy ? t("common.saving") : t("shifts.saveChanges")}
            </button>
            <button type="button" disabled={busy} onClick={cancelEditing}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card card--flush">
      <div className="card__head">
        <h2>{t("shifts.expensesAndTesting")}</h2>
        {!locked && canReview && (
          <button type="button" className="small" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </button>
        )}
      </div>
      <table className="money-table">
        <tbody>
          {(shift.expenses || []).map((expense, index) => (
            <tr key={index} className="money-row money-row--out">
              <td>{expense.label || "—"}</td>
              <td className="num">
                <Money
                  kind="out"
                  value={expense.amount}
                  label={expense.label || t("ledger.expenses")}
                />
              </td>
            </tr>
          ))}
          <tr className="money-row money-row--out">
            <td className="muted">{t("shifts.testingMs")}</td>
            <td className="num">
              <Money kind="out" value={totals.testingMS} label={t("shifts.testingMs")} />
            </td>
          </tr>
          <tr className="money-row money-row--out">
            <td className="muted">{t("shifts.testingHsd")}</td>
            <td className="num">
              <Money
                kind="out"
                value={totals.testingHSD}
                label={t("shifts.testingHsd")}
              />
            </td>
          </tr>
          <tr className="total money-row money-row--out">
            <td>{t("shifts.totalDeducted")}</td>
            <td className="num">
              <Money
                kind="out"
                value={totals.expensesTotal + totals.testingTotal}
                label={t("shifts.totalDeducted")}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
