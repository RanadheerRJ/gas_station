import { describe, expect, it } from "vitest";
import { changePct, monthOf, monthReport, shiftMonth } from "./reportMath.js";

/** A minimal settled shift that shiftTotals prices honestly. */
function shift({
  date,
  litres = 100,
  price = 100,
  expenses = [],
  payments,
  fuelType = "Petrol",
} = {}) {
  return {
    date,
    nozzles: [
      {
        nozzleId: "n1",
        label: "P1-N1",
        fuelType,
        openingReading: 1000,
        closingReading: 1000 + litres,
        price,
      },
    ],
    expenses,
    payments,
    testing: {},
  };
}

describe("monthOf", () => {
  it("extracts the YYYY-MM key from an ISO date", () => {
    expect(monthOf("2026-09-20")).toBe("2026-09");
    expect(monthOf("2025-01-01")).toBe("2025-01");
  });

  it("returns an empty key for non-strings", () => {
    expect(monthOf(undefined)).toBe("");
    expect(monthOf(null)).toBe("");
    expect(monthOf(20260920)).toBe("");
  });
});

describe("shiftMonth", () => {
  it("moves forward within a year", () => {
    expect(shiftMonth("2026-03", 1)).toBe("2026-04");
    expect(shiftMonth("2026-03", 5)).toBe("2026-08");
  });

  it("moves backward within a year", () => {
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("wraps the year going backward", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-02", -14)).toBe("2024-12");
  });

  it("wraps the year going forward", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-11", 14)).toBe("2028-01");
  });

  it("returns an empty key for bad input", () => {
    expect(shiftMonth("nonsense", 1)).toBe("");
    expect(shiftMonth("", -1)).toBe("");
    expect(shiftMonth(null, 1)).toBe("");
  });
});

describe("changePct", () => {
  it("signs the percentage both ways", () => {
    expect(changePct(112, 100)).toBeCloseTo(12);
    expect(changePct(90, 100)).toBeCloseTo(-10);
    expect(changePct(100, 100)).toBe(0);
  });

  it("returns null when there is no previous figure — no trend, not −100%", () => {
    expect(changePct(50, 0)).toBeNull();
    expect(changePct(50, null)).toBeNull();
    expect(changePct(50, undefined)).toBeNull();
  });
});

describe("monthReport", () => {
  it("totals only the shifts of the given month", () => {
    const shifts = [
      shift({ date: "2026-09-01", litres: 100, price: 100 }),
      shift({ date: "2026-09-15", litres: 50, price: 100 }),
      shift({ date: "2026-08-31", litres: 999, price: 100 }),
    ];
    const report = monthReport(shifts, "2026-09");
    expect(report.month).toBe("2026-09");
    expect(report.shifts).toBe(2);
    expect(report.litres).toBe(150);
    expect(report.sales).toBe(15000);
  });

  it("counts distinct dates, not shifts, as days worked", () => {
    const shifts = [
      shift({ date: "2026-09-01" }),
      shift({ date: "2026-09-01" }),
      shift({ date: "2026-09-02" }),
    ];
    expect(monthReport(shifts, "2026-09").days).toBe(2);
  });

  it("carries expenses, credit and variance through shiftTotals", () => {
    const shifts = [
      shift({
        date: "2026-09-03",
        litres: 100,
        price: 100, // gross 10000
        expenses: [{ label: "Power", amount: 500 }], // net 9500
        payments: { cash: 9000, credit: 400 }, // declared 9400 → variance −100
      }),
    ];
    const report = monthReport(shifts, "2026-09");
    expect(report.expenses).toBe(500);
    expect(report.credit).toBe(400);
    expect(report.variance).toBe(-100);
  });

  it("splits litres and revenue per fuel", () => {
    const shifts = [
      shift({ date: "2026-09-04", litres: 100, price: 100, fuelType: "Petrol" }),
      shift({ date: "2026-09-05", litres: 200, price: 90, fuelType: "Diesel" }),
      shift({ date: "2026-09-06", litres: 50, price: 100, fuelType: "Petrol" }),
    ];
    const report = monthReport(shifts, "2026-09");
    expect(report.fuels.Petrol).toEqual({ litres: 150, revenue: 15000 });
    expect(report.fuels.Diesel).toEqual({ litres: 200, revenue: 18000 });
  });

  it("always yields five week buckets, with per-week distinct-day counts", () => {
    const shifts = [
      shift({ date: "2026-09-01", litres: 10 }), // bucket 0
      shift({ date: "2026-09-07", litres: 10 }), // bucket 0
      shift({ date: "2026-09-08", litres: 20 }), // bucket 1
      shift({ date: "2026-09-22", litres: 30 }), // bucket 3
      shift({ date: "2026-09-29", litres: 40 }), // bucket 4
      shift({ date: "2026-09-29", litres: 5 }), // bucket 4, same day
    ];
    const { weeks } = monthReport(shifts, "2026-09");
    expect(weeks).toHaveLength(5);
    expect(weeks.map((w) => w.bucket)).toEqual([0, 1, 2, 3, 4]);
    expect(weeks[0].litres).toBe(20);
    expect(weeks[0].days).toBe(2);
    expect(weeks[1].litres).toBe(20);
    expect(weeks[2].litres).toBe(0);
    expect(weeks[2].days).toBe(0);
    expect(weeks[3].litres).toBe(30);
    expect(weeks[4].litres).toBe(45);
    expect(weeks[4].days).toBe(1);
  });

  it("puts day 31 in the last bucket, never a sixth", () => {
    const { weeks } = monthReport([shift({ date: "2026-07-31", litres: 7 })], "2026-07");
    expect(weeks).toHaveLength(5);
    expect(weeks[4].litres).toBe(7);
  });

  it("reports an empty month as all zeroes with the five buckets intact", () => {
    const report = monthReport([], "2026-02");
    expect(report.shifts).toBe(0);
    expect(report.days).toBe(0);
    expect(report.litres).toBe(0);
    expect(report.fuels).toEqual({});
    expect(report.weeks).toHaveLength(5);
    expect(report.weeks.every((w) => w.litres === 0 && w.days === 0)).toBe(true);
  });

  it("tolerates a shift with no date instead of crashing", () => {
    const shifts = [shift({ date: "2026-09-10", litres: 25 }), shift({})];
    const report = monthReport(shifts, "2026-09");
    expect(report.shifts).toBe(1);
    expect(report.litres).toBe(25);
  });
});
