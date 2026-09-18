import { useMemo, useState } from "react";
import { Field, Notice } from "./ui";
import { money, num, todayISO } from "../lib/format";

export const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

/** Blank working state for the form. */
export function blankDraft(fuelTypes = ["Petrol", "Diesel"]) {
  const fuelSales = {};
  const tankReadings = {};
  fuelTypes.forEach((f) => {
    fuelSales[f] = { litres: "", ratePerLitre: "", amount: 0 };
    tankReadings[f] = { opening: "", closing: "" };
  });
  return {
    date: todayISO(),
    fuelSales,
    tankReadings,
    cashIn: "",
    cashOut: "",
    expenses: [],
    creditSales: [],
  };
}

/** Turn a saved entry into editable form state. */
export function draftFromEntry(entry) {
  const types = Object.keys(entry.fuelSales || {});
  const base = blankDraft(types.length ? types : ["Petrol", "Diesel"]);
  return {
    ...base,
    date: entry.date || todayISO(),
    fuelSales: Object.fromEntries(
      Object.entries(entry.fuelSales || base.fuelSales).map(([k, v]) => [
        k,
        {
          litres: v.litres ?? "",
          ratePerLitre: v.ratePerLitre ?? "",
          amount: num(v.amount),
        },
      ])
    ),
    tankReadings: Object.fromEntries(
      Object.entries(entry.tankReadings || base.tankReadings).map(([k, v]) => [
        k,
        { opening: v.opening ?? "", closing: v.closing ?? "" },
      ])
    ),
    cashIn: entry.cashIn ?? "",
    cashOut: entry.cashOut ?? "",
    expenses: (entry.expenses || []).map((e) => ({ ...e })),
    creditSales: (entry.creditSales || []).map((c) => ({ ...c })),
  };
}

/** Strip the form state down to the stored shape, coercing numbers. */
export function draftToEntry(draft) {
  const fuelSales = {};
  Object.entries(draft.fuelSales).forEach(([fuel, row]) => {
    const litres = num(row.litres);
    const rate = num(row.ratePerLitre);
    if (!litres && !rate) return;
    fuelSales[fuel] = {
      litres,
      ratePerLitre: rate,
      amount: +(litres * rate).toFixed(2),
    };
  });

  const tankReadings = {};
  Object.entries(draft.tankReadings).forEach(([fuel, row]) => {
    if (row.opening === "" && row.closing === "") return;
    tankReadings[fuel] = { opening: num(row.opening), closing: num(row.closing) };
  });

  return {
    date: draft.date,
    fuelSales,
    tankReadings,
    cashIn: num(draft.cashIn),
    cashOut: num(draft.cashOut),
    expenses: draft.expenses
      .filter((e) => e.label?.trim())
      .map((e) => ({ label: e.label.trim(), amount: num(e.amount) })),
    creditSales: draft.creditSales
      .filter((c) => c.name?.trim())
      .map((c) => ({
        customerId: c.customerId || null,
        name: c.name.trim(),
        amount: num(c.amount),
      })),
  };
}

/**
 * The daily ledger form.
 * `variant="simple"` drops expenses and credit sales for the attendant flow.
 */
export default function EntryForm({
  draft,
  setDraft,
  variant = "full",
  customers = [],
  onSubmit,
  busy,
  error,
  submitLabel = "Save entry",
  onCancel,
  lockDate = false,
}) {
  const [localError, setLocalError] = useState("");
  const simple = variant === "simple";
  const fuels = Object.keys(draft.fuelSales);

  const totals = useMemo(() => {
    const sales = fuels.reduce(
      (n, f) =>
        n + num(draft.fuelSales[f].litres) * num(draft.fuelSales[f].ratePerLitre),
      0
    );
    const expenses = draft.expenses.reduce((n, e) => n + num(e.amount), 0);
    const credit = draft.creditSales.reduce((n, c) => n + num(c.amount), 0);
    const cash = sales + num(draft.cashIn) - credit - expenses - num(draft.cashOut);
    return { sales, expenses, credit, cash };
  }, [draft, fuels]);

  const setFuel = (fuel, key, value) =>
    setDraft((d) => ({
      ...d,
      fuelSales: { ...d.fuelSales, [fuel]: { ...d.fuelSales[fuel], [key]: value } },
    }));

  const setTank = (fuel, key, value) =>
    setDraft((d) => ({
      ...d,
      tankReadings: {
        ...d.tankReadings,
        [fuel]: { ...d.tankReadings[fuel], [key]: value },
      },
    }));

  const addFuelType = (fuel) =>
    setDraft((d) => ({
      ...d,
      fuelSales: { ...d.fuelSales, [fuel]: { litres: "", ratePerLitre: "", amount: 0 } },
      tankReadings: { ...d.tankReadings, [fuel]: { opening: "", closing: "" } },
    }));

  const submit = (e) => {
    e.preventDefault();
    setLocalError("");
    const entry = draftToEntry(draft);
    if (Object.keys(entry.fuelSales).length === 0) {
      setLocalError("Enter litres and rate for at least one fuel type.");
      return;
    }
    // Sanity check the dip readings so a typo doesn't quietly enter the book.
    const bad = Object.entries(entry.tankReadings).find(
      ([, r]) => r.closing > r.opening && r.opening > 0
    );
    if (bad) {
      setLocalError(
        `${bad[0]} closing reading is higher than opening — check the dip readings.`
      );
      return;
    }
    onSubmit(entry);
  };

  const unusedFuels = FUEL_TYPES.filter((f) => !fuels.includes(f));

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <Field label="Date">
          <input
            type="date"
            className="mono"
            value={draft.date}
            disabled={lockDate}
            max={todayISO()}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            style={{ width: 170 }}
          />
        </Field>
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Fuel sales</h3>
        <div className="panel flush">
          <table>
            <thead>
              <tr>
                <th>Fuel</th>
                <th className="num">Litres</th>
                <th className="num">Rate / litre</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {fuels.map((f) => {
                const row = draft.fuelSales[f];
                const amount = num(row.litres) * num(row.ratePerLitre);
                return (
                  <tr key={f}>
                    <td>{f}</td>
                    <td className="num">
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{ textAlign: "right" }}
                        value={row.litres}
                        onChange={(e) => setFuel(f, "litres", e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="num">
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{ textAlign: "right" }}
                        value={row.ratePerLitre}
                        onChange={(e) => setFuel(f, "ratePerLitre", e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="num mono">{money(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total fuel sales</td>
                <td className="num mono">{money(totals.sales)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {unusedFuels.length > 0 && (
          <div className="row small" style={{ marginTop: 8, alignItems: "center" }}>
            <span className="muted">Add fuel type:</span>
            {unusedFuels.map((f) => (
              <button
                key={f}
                type="button"
                className="small"
                onClick={() => addFuelType(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Tank readings</h3>
        <div className="panel flush">
          <table>
            <thead>
              <tr>
                <th>Fuel</th>
                <th className="num">Opening (L)</th>
                <th className="num">Closing (L)</th>
                <th className="num">Drawn (L)</th>
              </tr>
            </thead>
            <tbody>
              {fuels.map((f) => {
                const row = draft.tankReadings[f] || { opening: "", closing: "" };
                const drawn = num(row.opening) - num(row.closing);
                return (
                  <tr key={f}>
                    <td>{f}</td>
                    <td className="num">
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{ textAlign: "right" }}
                        value={row.opening}
                        onChange={(e) => setTank(f, "opening", e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="num">
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{ textAlign: "right" }}
                        value={row.closing}
                        onChange={(e) => setTank(f, "closing", e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="num mono">{money(drawn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Cash</h3>
        <div className="form-grid">
          <Field label="Cash in" hint="collections, float added">
            <input
              className="mono"
              inputMode="decimal"
              value={draft.cashIn}
              onChange={(e) => setDraft((d) => ({ ...d, cashIn: e.target.value }))}
              placeholder="0.00"
            />
          </Field>
          <Field label="Cash out" hint="banked, withdrawals">
            <input
              className="mono"
              inputMode="decimal"
              value={draft.cashOut}
              onChange={(e) => setDraft((d) => ({ ...d, cashOut: e.target.value }))}
              placeholder="0.00"
            />
          </Field>
        </div>
      </div>

      {!simple && (
        <>
          <div>
            <div className="between" style={{ marginBottom: 8 }}>
              <h3>Expenses</h3>
              <button
                type="button"
                className="small"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    expenses: [...d.expenses, { label: "", amount: "" }],
                  }))
                }
              >
                Add expense
              </button>
            </div>
            <div className="panel flush">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num" style={{ width: 160 }}>
                      Amount
                    </th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {draft.expenses.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted small">
                        No expenses recorded.
                      </td>
                    </tr>
                  )}
                  {draft.expenses.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          value={row.label}
                          placeholder="Power bill"
                          onChange={(e) =>
                            setDraft((d) => {
                              const expenses = [...d.expenses];
                              expenses[i] = { ...expenses[i], label: e.target.value };
                              return { ...d, expenses };
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          className="mono"
                          inputMode="decimal"
                          style={{ textAlign: "right" }}
                          value={row.amount}
                          placeholder="0.00"
                          onChange={(e) =>
                            setDraft((d) => {
                              const expenses = [...d.expenses];
                              expenses[i] = { ...expenses[i], amount: e.target.value };
                              return { ...d, expenses };
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              expenses: d.expenses.filter((_, j) => j !== i),
                            }))
                          }
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total expenses</td>
                    <td className="num mono">{money(totals.expenses)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <div className="between" style={{ marginBottom: 8 }}>
              <h3>Credit sales</h3>
              <button
                type="button"
                className="small"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    creditSales: [
                      ...d.creditSales,
                      { customerId: "", name: "", amount: "" },
                    ],
                  }))
                }
              >
                Add credit sale
              </button>
            </div>
            <div className="panel flush">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="num" style={{ width: 160 }}>
                      Amount
                    </th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {draft.creditSales.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted small">
                        No credit sales recorded.
                      </td>
                    </tr>
                  )}
                  {draft.creditSales.map((row, i) => (
                    <tr key={i}>
                      <td>
                        {customers.length > 0 ? (
                          <select
                            value={row.customerId || ""}
                            onChange={(e) => {
                              const c = customers.find((x) => x.id === e.target.value);
                              setDraft((d) => {
                                const creditSales = [...d.creditSales];
                                creditSales[i] = {
                                  ...creditSales[i],
                                  customerId: e.target.value,
                                  name: c?.name || "",
                                };
                                return { ...d, creditSales };
                              });
                            }}
                          >
                            <option value="">Select customer…</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={row.name}
                            placeholder="Customer name"
                            onChange={(e) =>
                              setDraft((d) => {
                                const creditSales = [...d.creditSales];
                                creditSales[i] = {
                                  ...creditSales[i],
                                  name: e.target.value,
                                };
                                return { ...d, creditSales };
                              })
                            }
                          />
                        )}
                      </td>
                      <td className="num">
                        <input
                          className="mono"
                          inputMode="decimal"
                          style={{ textAlign: "right" }}
                          value={row.amount}
                          placeholder="0.00"
                          onChange={(e) =>
                            setDraft((d) => {
                              const creditSales = [...d.creditSales];
                              creditSales[i] = {
                                ...creditSales[i],
                                amount: e.target.value,
                              };
                              return { ...d, creditSales };
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              creditSales: d.creditSales.filter((_, j) => j !== i),
                            }))
                          }
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total on credit</td>
                    <td className="num mono">{money(totals.credit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="panel">
        <div className="body row" style={{ gap: 40 }}>
          <div className="stat">
            <span className="k">Fuel sales</span>
            <span className="v">{money(totals.sales)}</span>
          </div>
          {!simple && (
            <>
              <div className="stat">
                <span className="k">Less credit</span>
                <span className="v">{money(totals.credit)}</span>
              </div>
              <div className="stat">
                <span className="k">Less expenses</span>
                <span className="v">{money(totals.expenses)}</span>
              </div>
            </>
          )}
          <div className="stat">
            <span className="k">Expected cash in hand</span>
            <span className={`v ${totals.cash < 0 ? "neg" : "pos"}`}>
              {money(totals.cash)}
            </span>
          </div>
        </div>
      </div>

      {(localError || error) && <Notice kind="error">{localError || error}</Notice>}

      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
