import Money from "../../components/Money.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Expenses logged while the shift was open.
 *
 * An ordinary close shows them read-only — they were recorded as they
 * happened. A sent-back shift lets whoever is correcting it edit the list,
 * because a wrong expense is one of the reasons a shift comes back. Either
 * way the subtotal reads as spent money in the shared colour language.
 */
export default function ExpensesSection({
  isCorrection,
  expenses,
  setEditedExpenses,
  expensesTotal,
}) {
  const { t } = useLanguage();
  return (
    <section className="card card--flush" id="close-expenses">
      <div className="card__head">
        <h2>{t("shifts.expensesLogged")}</h2>
        <Money kind="out" value={expensesTotal} label={t("shifts.expensesLogged")} />
      </div>
      {isCorrection ? (
        <div className="stack section-pad">
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
                  autoComplete="off"
                  onChange={(e) => patch({ label: e.target.value })}
                />
                <input
                  className="mono input-xl"
                  inputMode="decimal"
                  autoComplete="off"
                  style={{ textAlign: "right" }}
                  value={expense.amount ?? ""}
                  placeholder="0.00"
                  aria-label={t("common.amount")}
                  onChange={(e) => patch({ amount: e.target.value })}
                />
                <button
                  type="button"
                  className="quiet row-remove"
                  onClick={() =>
                    setEditedExpenses((rows) => rows.filter((_, item) => item !== index))
                  }
                >
                  {t("common.remove")}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="small row-add"
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
                <Money kind="out" value={expense.amount} label={expense.label} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
