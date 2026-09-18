export const todayISO = () => new Date().toISOString().slice(0, 10);

export function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function litres(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatStamp(value) {
  if (!value) return "—";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Total of a ledger entry's fuel sales. */
export function entrySalesTotal(entry) {
  return Object.values(entry?.fuelSales || {}).reduce(
    (sum, row) => sum + num(row?.amount),
    0
  );
}

export function entryExpensesTotal(entry) {
  return (entry?.expenses || []).reduce((sum, e) => sum + num(e.amount), 0);
}

export function entryCreditTotal(entry) {
  return (entry?.creditSales || []).reduce((sum, c) => sum + num(c.amount), 0);
}

/** Cash that should be in the drawer: sales + cash in − credit − expenses − cash out. */
export function entryCashPosition(entry) {
  return (
    entrySalesTotal(entry) +
    num(entry?.cashIn) -
    entryCreditTotal(entry) -
    entryExpensesTotal(entry) -
    num(entry?.cashOut)
  );
}
