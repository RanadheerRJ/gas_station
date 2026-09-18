import { describe, expect, it } from "vitest";
import {
  EXPANSION_PER_C,
  REFERENCE_TEMP_C,
  fillPercent,
  litresSoldSince,
  reconcileTank,
  stockByProduct,
  tankGroup,
  tankStatus,
  validateDip,
  volumeAt15,
} from "./tankMath";

/**
 * Volume maths. A wrong figure here means either fuel that appears to exist
 * and does not, or a leak that goes unnoticed, so the temperature correction
 * and the reconciliation tolerance both get pinned down.
 */

describe("fillPercent", () => {
  it("reports the fraction of capacity in use", () => {
    expect(fillPercent(5000, 20_000)).toBe(25);
  });

  it("never divides by a zero capacity", () => {
    expect(fillPercent(100, 0)).toBe(0);
  });

  it("clamps an over-full reading to 100", () => {
    expect(fillPercent(25_000, 20_000)).toBe(100);
  });

  it("clamps a negative reading to zero", () => {
    expect(fillPercent(-50, 20_000)).toBe(0);
  });
});

describe("volumeAt15", () => {
  it("leaves fuel already at the reference temperature alone", () => {
    expect(volumeAt15(10_000, REFERENCE_TEMP_C, "Diesel")).toBe(10_000);
  });

  it("corrects warm fuel downwards, because heat inflates the reading", () => {
    expect(volumeAt15(10_000, 35, "Petrol")).toBeLessThan(10_000);
  });

  it("corrects cold fuel upwards", () => {
    expect(volumeAt15(10_000, 5, "Petrol")).toBeGreaterThan(10_000);
  });

  it("moves petrol further than diesel for the same temperature swing", () => {
    const petrol = Math.abs(10_000 - volumeAt15(10_000, 35, "Petrol"));
    const diesel = Math.abs(10_000 - volumeAt15(10_000, 35, "Diesel"));
    expect(petrol).toBeGreaterThan(diesel);
  });

  it("matches the documented coefficient", () => {
    // 10000 L at 35 C, petrol: 10000 * (1 - 0.0012 * 20) = 9760
    expect(volumeAt15(10_000, 35, "Petrol")).toBe(9760);
  });

  it("returns null rather than guessing when no temperature was taken", () => {
    expect(volumeAt15(10_000, "", "Petrol")).toBeNull();
    expect(volumeAt15(10_000, null, "Petrol")).toBeNull();
  });

  it("keeps the correction small enough to be plausible physics", () => {
    // A 20 C swing should move volume by low single-digit percent, not tens.
    const drift = Math.abs(10_000 - volumeAt15(10_000, 35, "Diesel")) / 10_000;
    expect(drift).toBeLessThan(0.05);
  });

  it("exposes a coefficient per product group", () => {
    expect(EXPANSION_PER_C.MS).toBeGreaterThan(EXPANSION_PER_C.HSD);
  });
});

describe("tankStatus", () => {
  const tank = {
    capacity: 20_000,
    currentStock: 12_500,
    fuelType: "Petrol",
    temperatureC: 32,
  };

  it("computes fill and ullage from capacity", () => {
    const st = tankStatus(tank);
    expect(st.fillPercent).toBe(62.5);
    expect(st.ullage).toBe(7500);
  });

  it("grades a comfortable tank as ok", () => {
    expect(tankStatus(tank).level).toBe("ok");
  });

  it("grades a tank under a quarter as low", () => {
    expect(tankStatus({ ...tank, currentStock: 3000 }).level).toBe("low");
  });

  it("grades a nearly empty tank as critical", () => {
    expect(tankStatus({ ...tank, currentStock: 800 }).level).toBe("critical");
  });

  it("flags a retired tank", () => {
    expect(tankStatus({ ...tank, state: "retired" }).retired).toBe(true);
  });

  it("reports no corrected volume when temperature is missing", () => {
    expect(tankStatus({ ...tank, temperatureC: null }).volumeAt15).toBeNull();
  });
});

describe("validateDip", () => {
  const tank = { capacity: 20_000, fuelType: "Diesel" };

  it("accepts a plausible reading", () => {
    expect(
      validateDip({ stockLitres: 9000, temperatureC: 30, waterCm: 0.5 }, tank)
    ).toEqual([]);
  });

  it("requires a stock figure", () => {
    expect(
      validateDip({ stockLitres: "", temperatureC: 30 }, tank).length
    ).toBeGreaterThan(0);
  });

  it("requires a temperature, because volume is meaningless without it", () => {
    expect(
      validateDip({ stockLitres: 9000, temperatureC: "" }, tank).length
    ).toBeGreaterThan(0);
  });

  it("rejects more fuel than the tank can hold", () => {
    expect(
      validateDip({ stockLitres: 25_000, temperatureC: 30 }, tank).length
    ).toBeGreaterThan(0);
  });

  it("rejects a negative stock reading", () => {
    expect(
      validateDip({ stockLitres: -1, temperatureC: 30 }, tank).length
    ).toBeGreaterThan(0);
  });

  it.each([95, -4])("rejects an implausible probe reading of %s C", (temp) => {
    expect(
      validateDip({ stockLitres: 9000, temperatureC: temp }, tank).length
    ).toBeGreaterThan(0);
  });
});

describe("reconcileTank", () => {
  it("builds book stock from opening, deliveries and sales", () => {
    const r = reconcileTank({
      openingStock: 15_000,
      delivered: 5000,
      soldLitres: 7500,
      closingStock: 12_480,
    });
    expect(r.book).toBe(12_500);
    expect(r.variance).toBe(-20);
  });

  it("treats dip-stick imprecision as within tolerance", () => {
    const r = reconcileTank({
      openingStock: 15_000,
      delivered: 0,
      soldLitres: 2500,
      closingStock: 12_480,
    });
    expect(r.withinTolerance).toBe(true);
  });

  it("flags a shortfall big enough to be a leak", () => {
    const r = reconcileTank({
      openingStock: 15_000,
      delivered: 0,
      soldLitres: 5000,
      closingStock: 9800,
    });
    expect(r.withinTolerance).toBe(false);
    expect(r.variance).toBeLessThan(0);
  });

  it("flags an unexplained gain as well as a loss", () => {
    const r = reconcileTank({
      openingStock: 10_000,
      delivered: 0,
      soldLitres: 1000,
      closingStock: 9500,
    });
    expect(r.variance).toBeGreaterThan(0);
  });
});

describe("litresSoldSince", () => {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();

  it("counts only the matching product", () => {
    const sold = litresSoldSince(
      [
        {
          status: "approved",
          endTime: hourAgo,
          nozzles: [{ fuelType: "Diesel", openingReading: 100, closingReading: 400 }],
        },
        {
          status: "approved",
          endTime: hourAgo,
          nozzles: [{ fuelType: "Petrol", openingReading: 100, closingReading: 900 }],
        },
      ],
      "Diesel",
      yesterday
    );
    expect(sold).toBe(300);
  });

  it("ignores shifts that are still open", () => {
    const sold = litresSoldSince(
      [
        {
          status: "open",
          endTime: null,
          nozzles: [{ fuelType: "Diesel", openingReading: 0, closingReading: 999 }],
        },
      ],
      "Diesel",
      yesterday
    );
    expect(sold).toBe(0);
  });

  it("ignores shifts closed before the window opened", () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const sold = litresSoldSince(
      [
        {
          status: "approved",
          endTime: old,
          nozzles: [{ fuelType: "Diesel", openingReading: 0, closingReading: 500 }],
        },
      ],
      "Diesel",
      yesterday
    );
    expect(sold).toBe(0);
  });
});

describe("stockByProduct", () => {
  it("groups tanks by the product they hold", () => {
    const out = stockByProduct([
      { fuelType: "Diesel", capacity: 30_000, currentStock: 10_000 },
      { fuelType: "Diesel", capacity: 30_000, currentStock: 5000 },
      { fuelType: "Petrol", capacity: 20_000, currentStock: 8000 },
    ]);
    expect(out.Diesel.tanks).toBe(2);
    expect(out.Diesel.stock).toBe(15_000);
    expect(out.Petrol.stock).toBe(8000);
  });
});

describe("tankGroup", () => {
  it.each([
    ["Petrol", "MS"],
    ["Premium Petrol", "MS"],
    ["Diesel", "HSD"],
    ["CNG", "OTHER"],
  ])("maps %s to %s", (fuel, group) => {
    expect(tankGroup(fuel)).toBe(group);
  });
});
