/**
 * Credit-customer statements: the maths behind the bank-statement ledger.
 *
 * Kept pure and free of React, i18n and Supabase so the screen, the CSV and
 * the PDF can all be built from the same numbers — an exported statement that
 * disagrees with the one on the phone is worse than no export at all.
 *
 * Conventions, fixed here so every surface agrees:
 *   - Credit given is a DEBIT: it increases what the customer owes (+).
 *   - Payment received is a CREDIT: it reduces what the customer owes (−).
 *   - Running balances are always true balances, computed over the whole
 *     history in ascending order, never over the filtered subset.
 */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** The ISO day part of a date, a timestamp, or a Date. */
export function isoDay(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/** The day a transaction belongs to: the entered date, else when it landed. */
export function entryDay(tx) {
  return isoDay(tx?.date || tx?.recordedAt);
}

/** "14:05" from a timestamp, or "" when there is nothing to show. */
export function entryTime(value) {
  if (!value) return "";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* Periods                                                              */
/* ------------------------------------------------------------------ */

export const PERIODS = ["thisMonth", "lastMonth", "last3Months", "custom"];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * The inclusive ISO range for a named period.
 *
 * "custom" has no computable range — the caller keeps whatever the operator
 * typed, so the current range is handed back untouched.
 */
export function periodRange(period, today = new Date(), current = null) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const to = ymd(y, m, today.getDate());
  if (period === "lastMonth") {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
    return { from: ymd(ly, lm, 1), to: ymd(ly, lm, lastDay) };
  }
  if (period === "last3Months") {
    const start = new Date(Date.UTC(y, m - 3, 1));
    return {
      from: ymd(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
      to,
    };
  }
  if (period === "custom" && current) return { ...current };
  return { from: ymd(y, m, 1), to };
}

/* ------------------------------------------------------------------ */
/* Ledger                                                               */
/* ------------------------------------------------------------------ */

/** Oldest first, each entry carrying the balance that stood after it. */
export function ledgerEntries(transactions = []) {
  const sorted = [...transactions].sort((a, b) => {
    const dayDiff = entryDay(a).localeCompare(entryDay(b));
    if (dayDiff !== 0) return dayDiff;
    return String(a.recordedAt || "").localeCompare(String(b.recordedAt || ""));
  });
  let balance = 0;
  return sorted.map((tx, index) => {
    const amount = num(tx.amount);
    const credit = tx.type === "credit";
    balance += credit ? amount : -amount;
    return {
      id: tx.id || `${entryDay(tx)}-${index}`,
      day: entryDay(tx),
      time: entryTime(tx.recordedAt),
      type: credit ? "credit" : "payment",
      amount,
      note: tx.note || "",
      recordedByName: tx.recordedByName || "",
      balance,
    };
  });
}

/**
 * Everything a statement needs for one customer, one period, one filter.
 *
 * `rows` come back newest first (how a phone reads a ledger) while `ascending`
 * keeps chronological order for exports. The opening balance is the true
 * balance the moment before the period starts, so opening + movements always
 * reconciles to the closing balance.
 */
export function buildStatement({ transactions = [], range = {}, filter = "all" } = {}) {
  const all = ledgerEntries(transactions);
  const from = isoDay(range.from);
  const to = isoDay(range.to);
  const before = all.filter((entry) => from && entry.day < from);
  const inPeriod = all.filter(
    (entry) => (!from || entry.day >= from) && (!to || entry.day <= to)
  );
  const opening = before.length ? before[before.length - 1].balance : 0;
  const closing = inPeriod.length ? inPeriod[inPeriod.length - 1].balance : opening;
  const shown = inPeriod.filter((entry) =>
    filter === "payments"
      ? entry.type === "payment"
      : filter === "credit"
        ? entry.type === "credit"
        : true
  );
  const totals = shown.reduce(
    (out, entry) => {
      if (entry.type === "credit") out.creditGiven += entry.amount;
      else out.paymentsReceived += entry.amount;
      return out;
    },
    { creditGiven: 0, paymentsReceived: 0 }
  );
  totals.net = totals.creditGiven - totals.paymentsReceived;
  return {
    opening,
    closing,
    totals,
    ascending: shown,
    rows: [...shown].reverse(),
    count: shown.length,
    periodCount: inPeriod.length,
  };
}

/** Newest-first rows regrouped under their day, for the sticky date headers. */
export function groupByDay(rows = []) {
  const groups = [];
  rows.forEach((row) => {
    const last = groups[groups.length - 1];
    if (last && last.day === row.day) last.rows.push(row);
    else groups.push({ day: row.day, rows: [row] });
  });
  return groups;
}
