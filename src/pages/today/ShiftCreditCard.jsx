import { useCallback, useEffect, useMemo, useState } from "react";
import Money from "../../components/Money.jsx";
import Sheet from "../../components/Sheet.jsx";
import { Empty, Notice } from "../../components/ui.jsx";
import { PlusIcon } from "../../components/icons.jsx";
import { useRunner } from "../../state/useRunner.js";
import { useLanguage } from "../../state/LanguageContext.jsx";
import {
  addShiftCredit,
  createCustomer,
  listCustomerDirectory,
  listShiftCredit,
  readableError,
  updateCustomerCredit,
  voidCustomerCredit,
} from "../../lib/api";
import { money, num } from "../../lib/format";
import { entryTime } from "../../lib/statement.js";

const VOID_REASONS = [
  "credit.voidReasonWrongAmount",
  "credit.voidReasonWrongCustomer",
  "credit.voidReasonDuplicate",
  "credit.voidReasonNoFuel",
  "credit.voidReasonOther",
];

const amountInput = (value) =>
  String(value || "")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1")
    .replace(/^(\d+\.\d{0,2}).*$/, "$1");

/**
 * Credit sales on the running shift.
 *
 * The one authoritative credit path for an attendant while the shift is open:
 * the entry is posted straight away by add_shift_credit, tied to this shift
 * and this operator, and can be corrected or voided by them until the shift
 * is approved. Deliberately balance-free — an attendant records what was
 * taken and never learns what the account owes.
 */
export default function ShiftCreditCard({ stationId, shiftId }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [sheet, setSheet] = useState(null); // "add" | "edit" | "void"
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    customerId: "",
    name: "",
    phone: "",
    amount: "",
    note: "",
    creating: false,
  });
  const [edit, setEdit] = useState({ amount: "", reason: "" });
  const [voiding, setVoiding] = useState({ reason: "", note: "" });

  const load = useCallback(async () => {
    if (!stationId || !shiftId) return;
    try {
      const [rows, directory] = await Promise.all([
        listShiftCredit(stationId, shiftId),
        listCustomerDirectory(stationId).catch(() => []),
      ]);
      setEntries(rows);
      setCustomers(directory);
      setLoadError("");
    } catch (err) {
      setLoadError(readableError(err));
    }
  }, [stationId, shiftId]);

  useEffect(() => {
    load();
  }, [load]);

  const [run, busy, runError] = useRunner(load);

  const total = entries
    .filter((entry) => entry.status !== "voided")
    .reduce((sum, entry) => sum + num(entry.amount), 0);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = q
      ? customers.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q))
      : customers;
    return pool.slice(0, 8);
  }, [customers, search]);

  const closeSheet = () => {
    setSheet(null);
    setActive(null);
  };

  const openAdd = () => {
    setForm({
      customerId: "",
      name: "",
      phone: "",
      amount: "",
      note: "",
      creating: false,
    });
    setSearch("");
    setSheet("add");
  };

  const submitAdd = async (event) => {
    event.preventDefault();
    const amount = num(form.amount);
    if (amount <= 0) return;
    const ok = await run(async () => {
      let customerId = form.customerId;
      if (!customerId) {
        // Reuses the existing create_customer RPC rather than a second
        // customer-creation path.
        const created = await createCustomer(stationId, {
          name: form.name.trim(),
          phone: form.phone.trim(),
        });
        customerId = created.id;
      }
      return addShiftCredit(stationId, shiftId, {
        customerId,
        amount,
        note: form.note.trim(),
      });
    });
    if (ok) closeSheet();
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const ok = await run(() =>
      updateCustomerCredit(active.id, num(edit.amount), edit.reason.trim())
    );
    if (ok) closeSheet();
  };

  const submitVoid = async (event) => {
    event.preventDefault();
    const ok = await run(() =>
      voidCustomerCredit(active.id, voiding.reason, voiding.note.trim())
    );
    if (ok) closeSheet();
  };

  const chosen = customers.find((c) => c.id === form.customerId);
  const canSaveAdd =
    num(form.amount) > 0 && (form.customerId || form.name.trim().length > 0);

  return (
    <section className="card card--flush shift-credit" id="shift-credit">
      <div className="card__head">
        <h2>{t("shifts.creditSales")}</h2>
        <Money kind="credit" value={total} label={t("shifts.creditSales")} />
      </div>
      <p className="section-help">{t("credit.shiftCreditHelp")}</p>
      {(loadError || runError) && (
        <div className="section-pad">
          <Notice kind="error">{loadError || runError}</Notice>
        </div>
      )}
      <div>
        {entries.length === 0 ? (
          <Empty>{t("credit.noCreditYet")}</Empty>
        ) : (
          entries.map((entry) => {
            const voided = entry.status === "voided";
            return (
              <div
                key={entry.id}
                className={`ledger-row${voided ? " ledger-row--voided" : ""}`}
              >
                <div className="ledger-row__main">
                  <strong>{entry.customerName}</strong>
                  <span className="ledger-row__sub">
                    {[entry.note, entryTime(entry.recordedAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {voided && <span className="tag rust">{t("credit.voided")}</span>}
                  {!voided && entry.editCount > 0 && (
                    <span className="tag">{t("credit.corrected")}</span>
                  )}
                </div>
                <div className="ledger-row__figures">
                  <span className="ledger-row__amt mono">₹{money(entry.amount)}</span>
                  {entry.canEdit ? (
                    <span className="ledger-row__actions">
                      <button
                        type="button"
                        className="small"
                        disabled={busy}
                        onClick={() => {
                          setActive(entry);
                          setEdit({ amount: String(entry.amount), reason: "" });
                          setSheet("edit");
                        }}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="small quiet"
                        disabled={busy}
                        onClick={() => {
                          setActive(entry);
                          setVoiding({ reason: "", note: "" });
                          setSheet("void");
                        }}
                      >
                        {t("credit.voidCredit")}
                      </button>
                    </span>
                  ) : (
                    !voided && (
                      <span className="small muted">🔒 {t("credit.lockedApproved")}</span>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="section-pad">
        <button type="button" className="small row-add" onClick={openAdd}>
          <PlusIcon size={14} /> {t("credit.addCredit")}
        </button>
      </div>

      <Sheet open={sheet === "add"} onClose={closeSheet} title={t("credit.addCredit")}>
        <form className="stack" onSubmit={submitAdd}>
          {!form.creating ? (
            <>
              <label className="field">
                <span>{t("credit.searchCustomer")}</span>
                <input
                  autoFocus
                  value={search}
                  autoComplete="off"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setForm((f) => ({ ...f, customerId: "" }));
                  }}
                />
              </label>
              <div className="customer-picker">
                {matches.map((customer) => (
                  <button
                    type="button"
                    key={customer.id}
                    className={form.customerId === customer.id ? "active" : ""}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        customerId: customer.id,
                        name: customer.name,
                        phone: customer.phone || "",
                      }))
                    }
                  >
                    <b>{customer.name}</b>
                    <span>{customer.phone || "—"}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="small"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    creating: true,
                    customerId: "",
                    name: search.trim(),
                  }))
                }
              >
                + {t("credit.newCustomerShort")}
              </button>
            </>
          ) : (
            <>
              <label className="field">
                <span>{t("credit.customerName")}</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>{t("common.phone")}</span>
                <input
                  className="mono"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
            </>
          )}
          <label className="amount-field">
            <span>₹</span>
            <input
              inputMode="decimal"
              aria-label={t("common.amount")}
              placeholder="0.00"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: amountInput(e.target.value) }))
              }
            />
          </label>
          <label className="field">
            <span>
              {t("common.note")} <small>{t("common.optional")}</small>
            </span>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </label>
          {chosen && <p className="small muted">{chosen.name}</p>}
          <button className="cta" disabled={busy || !canSaveAdd}>
            {busy ? t("credit.posting") : t("credit.saveCredit")}
          </button>
        </form>
      </Sheet>

      <Sheet open={sheet === "edit"} onClose={closeSheet} title={t("credit.editCredit")}>
        {active && (
          <form className="stack" onSubmit={submitEdit}>
            <p className="small muted">{active.customerName}</p>
            <div className="sheet-preview">
              {t("credit.originalAmount")}: ₹{money(active.amount)}
            </div>
            <label className="amount-field">
              <span>₹</span>
              <input
                autoFocus
                inputMode="decimal"
                aria-label={t("credit.newAmount")}
                value={edit.amount}
                onChange={(e) =>
                  setEdit((v) => ({ ...v, amount: amountInput(e.target.value) }))
                }
              />
            </label>
            <label className="field">
              <span>{t("credit.reasonLabel")}</span>
              <input
                value={edit.reason}
                placeholder={t("credit.reasonPlaceholder")}
                onChange={(e) => setEdit((v) => ({ ...v, reason: e.target.value }))}
              />
            </label>
            <button
              className="cta"
              disabled={busy || num(edit.amount) <= 0 || !edit.reason.trim()}
            >
              {t("credit.saveChanges")}
            </button>
          </form>
        )}
      </Sheet>

      <Sheet open={sheet === "void"} onClose={closeSheet} title={t("credit.voidCredit")}>
        {active && (
          <form className="stack" onSubmit={submitVoid}>
            <p className="small muted">
              ₹{money(active.amount)} · {active.customerName}
            </p>
            <div className="filter-chips filter-chips--stack">
              {VOID_REASONS.map((key) => (
                <button
                  type="button"
                  key={key}
                  className={voiding.reason === t(key) ? "active" : ""}
                  onClick={() => setVoiding((v) => ({ ...v, reason: t(key) }))}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <label className="field">
              <span>
                {t("credit.additionalNote")}{" "}
                <small>
                  {voiding.reason === t("credit.voidReasonOther")
                    ? ""
                    : t("common.optional")}
                </small>
              </span>
              <input
                value={voiding.note}
                onChange={(e) => setVoiding((v) => ({ ...v, note: e.target.value }))}
              />
            </label>
            <button
              className="cta danger"
              disabled={
                busy ||
                !voiding.reason ||
                (voiding.reason === t("credit.voidReasonOther") && !voiding.note.trim())
              }
            >
              {t("credit.voidCredit")}
            </button>
          </form>
        )}
      </Sheet>
    </section>
  );
}
