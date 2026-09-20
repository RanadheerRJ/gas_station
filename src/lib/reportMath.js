/**
 * Monthly report arithmetic.
 *
 * Everything here folds the SAME settled shifts the ledger lists through
 * the same `shiftTotals` — the report is a different grouping of the same
 * figures, never a second source of truth, so the two screens can never
 * disagree.
 *
 * Kept pure and dependency-free (dates are string arithmetic on ISO keys,
 * not Date objects) so it can be unit-tested without a browser.
 */

import { shiftTotals } from "./shiftMath.js";

const round2 = (n) => Math.round(n * 100) / 100;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "YYYY-MM" of an ISO date string; "" for anything that isn't one. */
export function monthOf(dateISO) {
  if (typeof dateISO !== "string") return "";
  return dateISO.slice(0, 7);
}

/**
 * The month `delta` months away from a "YYYY-MM" key, wrapping the year in
 * both directions ("2026-01" − 1 → "2025-12"). "" for bad input.
 */
export function shiftMonth(key, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  // Zero-based month arithmetic: floor-divide the overflow into the year,
  // and double-mod the remainder so a negative delta wraps upward too.
  const zeroBased = month - 1 + num(delta);
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12;
  return `${String(newYear).padStart(4, "0")}-${String(newMonth + 1).padStart(2, "0")}`;
}

/**
 * Signed percentage change from `previous` to `current`, or null when there
 * is no previous figure — a dead month is "no trend", not −100%.
 */
export function changePct(current, previous) {
  if (!previous) return null;
  return ((num(current) - num(previous)) / num(previous)) * 100;
}

/** The week bucket (0..4) a day-of-month falls in; days 29+ share bucket 4. */
const weekBucket = (day) => Math.min(Math.floor((day - 1) / 7), 4);

/**
 * Fold the shifts of one month into a single report:
 *
 *   { month, days, shifts, litres, sales, expenses, credit, variance,
 *     fuels, weeks }
 *
 * `fuels` maps fuel type → { litres, revenue }; `weeks` is ALWAYS five
 * buckets (1–7, 8–14, 15–21, 22–28, 29+) so the bars render a stable
 * five-column shape whatever the month holds. `days` counts distinct dates
 * — two shifts on one day are one day worked. Shifts with missing dates
 * simply never match the month key, so they are tolerated, not crashed on.
 */
export function monthReport(shifts, key) {
  const mine = (shifts || []).filter((shift) => monthOf(shift?.date) === key);

  const report = {
    month: key,
    days: 0,
    shifts: mine.length,
    litres: 0,
    sales: 0,
    expenses: 0,
    credit: 0,
    variance: 0,
    fuels: {},
    weeks: Array.from({ length: 5 }, (_, index) => ({
      bucket: index,
      days: 0,
      litres: 0,
      sales: 0,
      expenses: 0,
      variance: 0,
    })),
  };

  const monthDates = new Set();
  const weekDates = report.weeks.map(() => new Set());

  mine.forEach((shift) => {
    const totals = shiftTotals(shift);
    monthDates.add(shift.date);

    report.litres = round2(report.litres + totals.totalLitres);
    report.sales = round2(report.sales + totals.gross);
    report.expenses = round2(report.expenses + totals.expensesTotal);
    report.credit = round2(report.credit + num(totals.payments?.credit));
    report.variance = round2(report.variance + (totals.variance ?? 0));

    Object.entries(totals.fuels).forEach(([fuel, value]) => {
      report.fuels[fuel] ||= { litres: 0, revenue: 0 };
      report.fuels[fuel].litres = round2(report.fuels[fuel].litres + value.litres);
      report.fuels[fuel].revenue = round2(report.fuels[fuel].revenue + value.revenue);
    });

    const day = Number(String(shift.date).slice(8, 10));
    const week = report.weeks[weekBucket(day)];
    weekDates[week.bucket].add(shift.date);
    week.litres = round2(week.litres + totals.totalLitres);
    week.sales = round2(week.sales + totals.gross);
    week.expenses = round2(week.expenses + totals.expensesTotal);
    week.variance = round2(week.variance + (totals.variance ?? 0));
  });

  report.days = monthDates.size;
  report.weeks.forEach((week) => {
    week.days = weekDates[week.bucket].size;
  });

  return report;
}
