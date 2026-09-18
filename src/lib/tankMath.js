/**
 * Ground-stock arithmetic for underground storage tanks.
 *
 * A station's tanks are the other half of the ledger: nozzle meters say what
 * was sold, tanks say what is actually in the ground. The two must agree, and
 * where they don't the difference is either a leak, a delivery that was never
 * booked, or a meter that is lying.
 *
 * Temperature matters here. Petroleum expands as it warms, so a dip taken at
 * 34 °C reads more litres than the same fuel at 15 °C — which is the basis
 * every oil company invoices on. Recording the temperature alongside the dip
 * is what makes two readings comparable.
 *
 * Kept pure and dependency-free so it can be unit-tested without a browser.
 */

/** Coerce anything to a finite number, defaulting to 0. */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** The reference temperature Indian fuel volumes are quoted at. */
export const REFERENCE_TEMP_C = 15;

/**
 * Coefficient of volumetric expansion per °C, by product group.
 * Petrol is the lighter, more volatile product and moves roughly half as
 * much again as diesel for the same temperature swing.
 */
export const EXPANSION_PER_C = { MS: 0.0012, HSD: 0.00084, OTHER: 0.001 };

/** Temperatures outside this band suggest a faulty probe rather than hot fuel. */
export const TEMP_RANGE = { min: 5, max: 55 };

/** Water in the bottom of a tank is corrosive and dilutes deliveries. */
export const WATER_LIMIT_CM = 2.5;

/**
 * A tank is never deleted, only retired — the dips taken from it are part of
 * the station's stock history and must stay readable. Retiring hides it from
 * day-to-day screens; restoring brings it back. Every door swings both ways.
 */
export const TANK_STATE = { ACTIVE: "active", RETIRED: "retired" };

/** Product families, mirroring the MS/HSD split used for testing deductions. */
export function tankGroup(fuelType) {
  const f = String(fuelType || "").toLowerCase();
  if (f.includes("petrol") || f === "ms") return "MS";
  if (f.includes("diesel") || f.includes("hsd")) return "HSD";
  return "OTHER";
}

/**
 * Correct an observed volume to its equivalent at 15 °C.
 *
 * This is a linear approximation of the ASTM D1250 volume correction factor,
 * which is accurate to well within a tenth of a percent across the
 * temperatures a forecourt actually sees. It is deliberately not the full
 * table lookup: that needs the product's density at 15 °C, which a station
 * does not measure at every dip.
 */
export function volumeAt15(litres, temperatureC, fuelType) {
  const v = num(litres);
  if (temperatureC === "" || temperatureC == null) return null;
  const alpha = EXPANSION_PER_C[tankGroup(fuelType)] ?? EXPANSION_PER_C.OTHER;
  const vcf = 1 - alpha * (num(temperatureC) - REFERENCE_TEMP_C);
  return round2(v * vcf);
}

/** How full a tank is, as a percentage of its rated capacity. */
export function fillPercent(stock, capacity) {
  const cap = num(capacity);
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, round2((num(stock) / cap) * 100)));
}

/** A tank's working figures. */
export function tankStatus(tank = {}) {
  const capacity = num(tank.capacity);
  const stock = num(tank.currentStock);
  const ullage = Math.max(0, round2(capacity - stock));
  const pct = fillPercent(stock, capacity);

  return {
    capacity,
    stock: round2(stock),
    ullage,
    fillPercent: pct,
    // A quarter tank is the point at which an order needs placing to avoid
    // running a nozzle dry mid-shift.
    level: pct < 10 ? "critical" : pct < 25 ? "low" : pct > 95 ? "full" : "ok",
    retired: tank.state === TANK_STATE.RETIRED,
    temperature: tank.temperatureC ?? null,
    volumeAt15: volumeAt15(stock, tank.temperatureC, tank.fuelType),
  };
}

/** Flag a dip reading that cannot be right before it reaches the ledger. */
export function validateDip({ stockLitres, temperatureC, waterCm }, tank = {}) {
  const problems = [];
  const stock = Number(stockLitres);
  const capacity = num(tank.capacity);

  if (stockLitres === "" || stockLitres == null || !Number.isFinite(stock)) {
    problems.push("Enter the stock reading in litres.");
  } else if (stock < 0) {
    problems.push("Stock cannot be negative.");
  } else if (capacity > 0 && stock > capacity) {
    problems.push(`Stock of ${stock} L is more than the tank holds (${capacity} L).`);
  }

  if (temperatureC === "" || temperatureC == null) {
    problems.push("Record the fuel temperature.");
  } else {
    const t = Number(temperatureC);
    if (!Number.isFinite(t)) {
      problems.push("Temperature must be a number.");
    } else if (t < TEMP_RANGE.min || t > TEMP_RANGE.max) {
      problems.push(
        `A reading of ${t} °C is outside the plausible range ` +
          `(${TEMP_RANGE.min}–${TEMP_RANGE.max} °C). Check the probe.`
      );
    }
  }

  if (waterCm !== "" && waterCm != null) {
    const w = Number(waterCm);
    if (!Number.isFinite(w) || w < 0) problems.push("Water level must be zero or more.");
  }

  return problems;
}

/**
 * Reconcile a tank against the pumps that draw from it.
 *
 * Book stock is what should be left: the previous dip, plus anything
 * delivered, minus everything the meters sold. The difference against the
 * actual dip is the figure worth investigating — a persistent negative is how
 * a leaking tank announces itself.
 */
export function reconcileTank({
  openingStock,
  delivered = 0,
  soldLitres = 0,
  closingStock,
}) {
  const book = round2(num(openingStock) + num(delivered) - num(soldLitres));
  const actual = round2(num(closingStock));
  const variance = round2(actual - book);
  const pct = book > 0 ? round2((variance / book) * 100) : 0;
  return {
    book,
    actual,
    variance,
    variancePercent: pct,
    // Evaporation and dip-stick precision make small differences normal;
    // 0.5% of throughput is the usual industry tolerance.
    withinTolerance: Math.abs(pct) <= 0.5,
  };
}

/**
 * Litres drawn from a tank's product by shifts closed since a given time.
 * Ties the ground stock back to the nozzle meters already in the ledger.
 */
export function litresSoldSince(shifts = [], fuelType, sinceISO) {
  const since = sinceISO ? new Date(sinceISO).getTime() : 0;
  let total = 0;
  shifts.forEach((s) => {
    if (s.status === "open") return;
    const when = new Date(s.endTime || s.startTime || 0).getTime();
    if (!Number.isFinite(when) || when < since) return;
    (s.nozzles || []).forEach((n) => {
      if (tankGroup(n.fuelType) !== tankGroup(fuelType)) return;
      if (n.closingReading === "" || n.closingReading == null) return;
      const litres = num(n.closingReading) - num(n.openingReading);
      if (litres > 0) total += litres;
    });
  });
  return round2(total);
}

/** Roll every tank up into a station-level stock position, per product. */
export function stockByProduct(tanks = []) {
  const out = {};
  tanks.forEach((t) => {
    const key = t.fuelType || "Unknown";
    out[key] ||= { stock: 0, capacity: 0, ullage: 0, tanks: 0 };
    const st = tankStatus(t);
    out[key].stock = round2(out[key].stock + st.stock);
    out[key].capacity = round2(out[key].capacity + st.capacity);
    out[key].ullage = round2(out[key].ullage + st.ullage);
    out[key].tanks += 1;
  });
  return out;
}
