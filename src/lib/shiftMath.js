/**
 * Shift arithmetic.
 *
 * Sales are DERIVED from nozzle meter readings — never typed. A nozzle's
 * totaliser only ever counts up, so litres sold = closing − opening, priced
 * at the rate that was in force when the shift started.
 *
 * A shift holds a SUBSET of the station's nozzles (whichever the operator
 * took), so several shifts can run at once on different pumps.
 *
 * Kept pure and dependency-free so it can be unit-tested without a browser.
 */

/** Coerce anything to a finite number, defaulting to 0. */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** A meter that has rolled past its digit limit wraps back to zero. */
export const METER_ROLLOVER = 1_000_000;

/** Tolerance below which a variance is treated as rounding, not a discrepancy. */
export const VARIANCE_TOLERANCE = 1;

export const PAYMENT_MODES = ["cash", "card", "upi", "credit", "other"];

/**
 * Shift review states. A closed shift is not final until the owner or a
 * manager signs it off, and can be sent back for correction.
 */
export const SHIFT_STATUS = {
  OPEN: "open",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
};

/** Fuel groups used for the daily testing deduction. */
export const TESTING_GROUPS = { MS: "MS", HSD: "HSD" };
export const FUEL_GROUPS = ["MS", "HSD", "CNG", "OTHER"];

/** Petrol family is MS, diesel family is HSD. */
export function classifyFuel(fuelType) {
  const f = String(fuelType || "").toLowerCase();
  if (f.includes("petrol") || f === "ms") return "MS";
  if (f.includes("diesel") || f.includes("hsd")) return "HSD";
  if (f.includes("cng")) return "CNG";
  return "OTHER";
}

/** Litres sold per MS / HSD / OTHER group, for reporting. */
export function litresByGroup(lines = []) {
  const out = { MS: 0, HSD: 0, CNG: 0, OTHER: 0 };
  lines.forEach((l) => {
    out[classifyFuel(l.fuelType)] += num(l.litresSold);
  });
  Object.keys(out).forEach((k) => {
    out[k] = round2(out[k]);
  });
  return out;
}

export const PAYMENT_LABELS = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  credit: "Credit",
  other: "Other",
};

/**
 * Litres dispensed between two totaliser readings.
 * Handles the rollover case rather than reporting a negative sale.
 */
export function litresBetween(opening, closing) {
  const o = num(opening);
  const c = num(closing);
  if (c >= o) return round2(c - o);
  return round2(METER_ROLLOVER - o + c);
}

/**
 * Per-nozzle sales lines for a shift.
 * `nozzles` is the shift's array of assignments.
 */
export function nozzleLines(nozzles = []) {
  return nozzles.map((n) => {
    const hasClosing = n.closingReading !== "" && n.closingReading != null;
    const litres = hasClosing ? litresBetween(n.openingReading, n.closingReading) : 0;
    const price = num(n.price);
    return {
      nozzleId: n.nozzleId,
      pumpId: n.pumpId,
      label: n.label || n.nozzleId,
      fuelType: n.fuelType,
      openingReading: num(n.openingReading),
      closingReading: hasClosing ? num(n.closingReading) : null,
      price,
      litresSold: litres,
      revenue: round2(litres * price),
    };
  });
}

/** Roll per-nozzle lines up per fuel type. */
export function fuelTotals(lines) {
  const out = {};
  lines.forEach((l) => {
    if (!l.fuelType) return;
    out[l.fuelType] ||= { litres: 0, revenue: 0 };
    out[l.fuelType].litres = round2(out[l.fuelType].litres + l.litresSold);
    out[l.fuelType].revenue = round2(out[l.fuelType].revenue + l.revenue);
  });
  return out;
}

/** Sum a payments object across every mode. */
export function paymentsTotal(payments = {}) {
  return round2(PAYMENT_MODES.reduce((n, mode) => n + num(payments[mode]), 0));
}

/**
 * Full financial position of a shift.
 *
 *   gross     = sum of every nozzle line
 *   testing   = fuel run through the meter for calibration, not sold
 *   net       = gross − testing − expenses   (what should reach the owner)
 *   collected = cash + card + upi + credit + other
 *   variance  = collected − net              (negative = short)
 *   handover  = net − (card + upi + credit)  (physical cash owed to owner)
 */
export function shiftTotals(shift) {
  const lines = nozzleLines(shift?.nozzles);
  const gross = round2(lines.reduce((n, l) => n + l.revenue, 0));
  const totalLitres = round2(lines.reduce((n, l) => n + l.litresSold, 0));

  const expensesTotal = round2(
    (shift?.expenses || []).reduce((n, e) => n + num(e.amount), 0)
  );

  // Testing fuel physically left the nozzle but was never sold, so it comes
  // off the gross before anyone is asked to account for cash.
  const testing = shift?.testing || {};
  const testingMS = num(testing.MS);
  const testingHSD = num(testing.HSD);
  const testingTotal = round2(testingMS + testingHSD);

  const net = round2(gross - testingTotal - expensesTotal);

  const payments = shift?.payments || {};
  const anyDeclared = PAYMENT_MODES.some(
    (m) => payments[m] !== "" && payments[m] != null
  );
  const declared = anyDeclared ? paymentsTotal(payments) : null;
  const variance = declared == null ? null : round2(declared - net);

  // Non-cash modes are already settled elsewhere; only the remainder is
  // physically handed over.
  const nonCash = round2(
    num(payments.card) + num(payments.upi) + num(payments.credit) + num(payments.other)
  );
  const handover = round2(net - nonCash);

  return {
    lines,
    fuels: fuelTotals(lines),
    litresByGroup: litresByGroup(lines),
    totalLitres,
    gross,
    testingMS,
    testingHSD,
    testingTotal,
    expensesTotal,
    net,
    payments,
    declared,
    variance,
    nonCash,
    handover,
  };
}

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
export function validateClosing(nozzles = [], { allowRollover = false } = {}) {
  const problems = [];
  nozzles.forEach((n) => {
    const label = n.label || "Nozzle";
    if (n.closingReading === "" || n.closingReading == null) {
      problems.push(`${label}: closing reading is required.`);
      return;
    }
    const o = num(n.openingReading);
    const c = num(n.closingReading);
    if (c < o && !allowRollover) {
      problems.push(
        `${label}: closing ${c} is below opening ${o}. Check the reading, or confirm the meter rolled over.`
      );
    }
    if (!allowRollover && c - o > 50000) {
      problems.push(
        `${label}: ${(c - o).toFixed(0)} litres looks too high — check for a typo.`
      );
    }
  });
  return problems;
}

/* ------------------------------------------------------------------ */
/* effective-dated prices                                              */
/* ------------------------------------------------------------------ */

/**
 * The price record in force for a fuel at a given moment.
 * Prices are intervals: effectiveFrom .. effectiveTo (null = still active),
 * so history is never overwritten and a past shift always reprices correctly.
 */
export function priceAtTime(priceRecords = [], fuelType, atTime) {
  const at = new Date(atTime).getTime();
  const forFuel = priceRecords.filter((p) => p.fuelType === fuelType);

  const covering = forFuel
    .filter((p) => {
      const from = new Date(p.effectiveFrom).getTime();
      const to = p.effectiveTo ? new Date(p.effectiveTo).getTime() : null;
      return from <= at && (to == null || to >= at);
    })
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));

  if (covering.length) return covering[0];

  // Fall back to the most recent price that began before this moment.
  const before = forFuel
    .filter((p) => new Date(p.effectiveFrom).getTime() <= at)
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  return before[0] || null;
}

/** Currently-active price per fuel type, as a plain map. */
export function activePrices(priceRecords = []) {
  const map = {};
  [...priceRecords]
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))
    .forEach((p) => {
      if (!p.effectiveTo && !map[p.fuelType]) map[p.fuelType] = p;
    });
  return map;
}

/* ------------------------------------------------------------------ */
/* pump occupancy                                                      */
/* ------------------------------------------------------------------ */

/** Shown instead of a co-worker's name when the viewer may not know who it is. */
export const ANONYMOUS_OPERATOR = "Another operator";

/**
 * Which nozzles are tied up by an open shift, and who has them.
 * Returns { [nozzleId]: { shiftId, operator } }.
 *
 * Only owners and managers receive station-wide shift data, so this is the
 * privileged form of the lookup.
 */
export function nozzleOccupancy(openShifts = []) {
  const out = {};
  openShifts.forEach((s) => {
    (s.nozzles || []).forEach((n) => {
      out[n.nozzleId] = { shiftId: s.id, operator: s.employeeName || "Someone" };
    });
  });
  return out;
}

/**
 * The same shape, built from the anonymous list_nozzle_occupancy RPC.
 *
 * Attendants may only see that a nozzle is taken — never whose shift holds it
 * — so the RPC returns bare nozzle ids and the operator is a fixed label.
 */
export function anonymousNozzleOccupancy(busyNozzleIds = []) {
  const out = {};
  busyNozzleIds.forEach((entry) => {
    const id = typeof entry === "string" ? entry : entry?.nozzleId;
    if (id) out[id] = { shiftId: null, operator: ANONYMOUS_OPERATOR };
  });
  return out;
}

/**
 * Per-pump availability derived from nozzle occupancy.
 * A pump is busy when any of its nozzles is in an open shift.
 */
export function pumpOccupancy(pumps = [], nozzles = [], openShifts = []) {
  const byNozzle = nozzleOccupancy(openShifts);
  const out = {};
  pumps.forEach((p) => {
    const mine = nozzles.filter((n) => n.pumpId === p.id);
    const held = mine.filter((n) => byNozzle[n.nozzleId || n.id]);
    const operators = [
      ...new Set(held.map((n) => byNozzle[n.nozzleId || n.id].operator)),
    ];
    out[p.id] = {
      busy: held.length > 0,
      operators,
      heldNozzleIds: held.map((n) => n.id),
      nozzleCount: mine.length,
    };
  });
  return out;
}
