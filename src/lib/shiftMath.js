/**
 * Shift arithmetic.
 *
 * Sales are DERIVED from nozzle meter readings — never typed. A nozzle's
 * totaliser only ever counts up, so litres sold = closing − opening, priced
 * at the rate snapshotted onto the shift when it opened.
 *
 * Kept pure and dependency-free so it can be unit-tested without a browser.
 */

/** Coerce anything to a finite number, defaulting to 0. */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A meter that has rolled past its digit limit wraps back to zero. */
export const METER_ROLLOVER = 1_000_000;

/**
 * Litres dispensed between two totaliser readings.
 * Handles the rollover case rather than reporting a negative sale.
 */
export function litresBetween(opening, closing) {
  const o = num(opening);
  const c = num(closing);
  if (c >= o) return +(c - o).toFixed(2);
  // Wrapped past the meter's limit.
  return +(METER_ROLLOVER - o + c).toFixed(2);
}

/**
 * Per-nozzle sales lines for a shift.
 * `readings` is { [nozzleId]: { opening, closing, rate, fuelType, label } }.
 */
export function nozzleLines(readings = {}) {
  return Object.entries(readings).map(([nozzleId, r]) => {
    const litres = r.closing === "" || r.closing == null
      ? 0
      : litresBetween(r.opening, r.closing);
    const rate = num(r.rate);
    return {
      nozzleId,
      label: r.label || nozzleId,
      fuelType: r.fuelType,
      opening: num(r.opening),
      closing: r.closing === "" || r.closing == null ? null : num(r.closing),
      rate,
      litres,
      amount: +(litres * rate).toFixed(2),
    };
  });
}

/** Roll per-nozzle lines up per fuel type. */
export function fuelTotals(lines) {
  const out = {};
  lines.forEach((l) => {
    if (!l.fuelType) return;
    out[l.fuelType] ||= { litres: 0, amount: 0 };
    out[l.fuelType].litres = +(out[l.fuelType].litres + l.litres).toFixed(2);
    out[l.fuelType].amount = +(out[l.fuelType].amount + l.amount).toFixed(2);
  });
  return out;
}

/**
 * Full financial position of a shift.
 *
 *   meter sales  = sum of every nozzle line
 *   expected cash = meter sales − credit − digital − expenses
 *   variance      = declared cash − expected cash   (negative = short)
 */
export function shiftTotals(shift) {
  const lines = nozzleLines(shift?.readings);
  const grossSales = +lines.reduce((n, l) => n + l.amount, 0).toFixed(2);
  const totalLitres = +lines.reduce((n, l) => n + l.litres, 0).toFixed(2);

  const creditTotal = +(shift?.creditSales || [])
    .reduce((n, c) => n + num(c.amount), 0)
    .toFixed(2);
  const expensesTotal = +(shift?.expenses || [])
    .reduce((n, e) => n + num(e.amount), 0)
    .toFixed(2);
  const digital = num(shift?.digitalCollected);

  const expectedCash = +(grossSales - creditTotal - digital - expensesTotal).toFixed(2);

  const declared = shift?.cashDeclared === "" || shift?.cashDeclared == null
    ? null
    : num(shift.cashDeclared);
  const variance = declared == null ? null : +(declared - expectedCash).toFixed(2);

  return {
    lines,
    fuels: fuelTotals(lines),
    totalLitres,
    grossSales,
    creditTotal,
    expensesTotal,
    digital,
    expectedCash,
    declared,
    variance,
  };
}

/** Tolerance below which a variance is treated as rounding, not a discrepancy. */
export const VARIANCE_TOLERANCE = 1;

export function varianceTone(variance) {
  if (variance == null) return null;
  if (Math.abs(variance) <= VARIANCE_TOLERANCE) return "pos";
  return "neg";
}

export function varianceLabel(variance) {
  if (variance == null) return "not declared";
  if (Math.abs(variance) <= VARIANCE_TOLERANCE) return "balanced";
  return variance < 0 ? "short" : "excess";
}

/**
 * Validate closing readings before a shift can be closed.
 * Returns an array of human-readable problems (empty when good).
 */
export function validateClosing(readings, { allowRollover = false } = {}) {
  const problems = [];
  Object.entries(readings || {}).forEach(([, r]) => {
    const label = r.label || "Nozzle";
    if (r.closing === "" || r.closing == null) {
      problems.push(`${label}: closing reading is required.`);
      return;
    }
    const o = num(r.opening);
    const c = num(r.closing);
    if (c < o && !allowRollover) {
      problems.push(
        `${label}: closing ${c} is below opening ${o}. Check the reading, or confirm the meter rolled over.`
      );
    }
    if (!allowRollover && c - o > 50000) {
      problems.push(`${label}: ${(c - o).toFixed(0)} litres looks too high — check for a typo.`);
    }
  });
  return problems;
}
