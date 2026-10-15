export const todayISO = () => new Date().toISOString().slice(0, 10);

export function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A consistent Indian-rupee display with the sign before the currency mark. */
export function currency(value) {
  const n = Number(value) || 0;
  return `${n < 0 ? "−" : ""}₹${money(Math.abs(n))}`;
}

export function litres(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Coerce anything to a finite number, defaulting to 0. */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Round to two decimals — the one rounding rule every money/litre figure uses. */
export function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

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

/** "Mon, 5 Oct 2026" — the day header a bank statement groups entries under. */
export function formatDayLabel(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
