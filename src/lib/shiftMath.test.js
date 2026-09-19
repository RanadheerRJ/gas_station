import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_OPERATOR,
  METER_ROLLOVER,
  VARIANCE_TOLERANCE,
  anonymousNozzleOccupancy,
  classifyFuel,
  litresBetween,
  nozzleLines,
  nozzleOccupancy,
  paymentsTotal,
  shiftTotals,
  validateClosing,
} from "./shiftMath";

/**
 * These cover the money path: meters to litres, litres to rupees, and the
 * deductions that decide what an operator actually hands over. They are the
 * figures somebody is held to at the end of a shift, so the edges matter more
 * than the happy path.
 */

const nozzle = (over = {}) => ({
  nozzleId: "n1",
  pumpId: "p1",
  label: "Pump 1 · N1",
  fuelType: "Petrol",
  openingReading: 1000,
  closingReading: 1100,
  price: 100,
  ...over,
});

describe("litresBetween", () => {
  it("subtracts the opening reading from the closing one", () => {
    expect(litresBetween(1000, 1250.5)).toBe(250.5);
  });

  it("returns zero when the meter did not move", () => {
    expect(litresBetween(1000, 1000)).toBe(0);
  });

  it("handles a meter that wrapped past its digit limit", () => {
    // A six-digit totaliser at 999,990 that sells 20 L reads 10.
    expect(litresBetween(999_990, 10)).toBe(20);
  });

  it("does not report a rollover as a negative sale", () => {
    expect(litresBetween(999_990, 10)).toBeGreaterThan(0);
  });

  it("rounds to two places rather than carrying float noise", () => {
    expect(litresBetween(0.1, 0.3)).toBe(0.2);
  });

  it("exposes the rollover constant it assumes", () => {
    expect(METER_ROLLOVER).toBe(1_000_000);
  });
});

describe("nozzleLines", () => {
  it("prices litres at the rate snapshotted on the nozzle", () => {
    const [line] = nozzleLines([nozzle()]);
    expect(line.litresSold).toBe(100);
    expect(line.revenue).toBe(10_000);
  });

  it("treats a missing closing reading as nothing sold, not as zero litres sold", () => {
    const [line] = nozzleLines([nozzle({ closingReading: "" })]);
    expect(line.closingReading).toBeNull();
    expect(line.revenue).toBe(0);
  });

  it("ignores a later price change because the rate is snapshotted", () => {
    const [cheap] = nozzleLines([nozzle({ price: 100 })]);
    const [dear] = nozzleLines([nozzle({ price: 110 })]);
    expect(cheap.revenue).toBe(10_000);
    expect(dear.revenue).toBe(11_000);
  });
});

describe("shiftTotals", () => {
  const base = {
    nozzles: [nozzle()],
    testing: { MS: 500, HSD: 200 },
    expenses: [{ label: "Tea", amount: 300 }],
    payments: { cash: 6000, card: 1000, upi: 1500, credit: 500, other: 0 },
  };

  it("derives gross from the meters", () => {
    expect(shiftTotals(base).gross).toBe(10_000);
  });

  it("subtracts testing and expenses to reach net", () => {
    // 10000 gross - 700 testing - 300 expenses
    expect(shiftTotals(base).net).toBe(9000);
  });

  it("keeps the two testing figures separate for review", () => {
    const t = shiftTotals(base);
    expect(t.testingMS).toBe(500);
    expect(t.testingHSD).toBe(200);
    expect(t.testingTotal).toBe(700);
  });

  it("counts every payment mode as collected", () => {
    expect(shiftTotals(base).declared).toBe(9000);
  });

  it("reports a balanced shift as zero variance", () => {
    expect(shiftTotals(base).variance).toBe(0);
  });

  it("excludes cash from the non-cash total", () => {
    expect(shiftTotals(base).nonCash).toBe(3000);
  });

  it("hands over only the physical cash owed", () => {
    // net 9000 less 3000 settled by card, UPI and credit
    expect(shiftTotals(base).handover).toBe(6000);
  });

  it("reports a short drawer as a negative variance", () => {
    const short = shiftTotals({
      ...base,
      payments: { ...base.payments, cash: 5500 },
    });
    expect(short.variance).toBe(-500);
  });

  it("defaults testing to zero when it was never recorded", () => {
    const { testing: _drop, ...noTesting } = base;
    expect(shiftTotals(noTesting).testingTotal).toBe(0);
    expect(shiftTotals(noTesting).net).toBe(9700);
  });

  it("survives an empty shift without dividing by anything", () => {
    const empty = shiftTotals({ nozzles: [] });
    expect(empty.gross).toBe(0);
    expect(empty.net).toBe(0);
    expect(empty.handover).toBe(0);
  });

  it("distinguishes 'not declared yet' from 'declared as zero'", () => {
    // An untouched form must not read as a full shortfall, so declared stays
    // null until the operator enters something, and variance stays null with it.
    const blank = shiftTotals({
      nozzles: [nozzle()],
      payments: { cash: "", card: "", upi: "", credit: "", other: "" },
    });
    expect(blank.declared).toBeNull();
    expect(blank.variance).toBeNull();

    // An explicit zero is a real declaration and does produce a variance.
    const zero = shiftTotals({
      nozzles: [nozzle()],
      payments: { cash: 0, card: "", upi: "", credit: "", other: "" },
    });
    expect(zero.declared).toBe(0);
    expect(zero.variance).toBe(-10_000);
  });

  it("rolls litres up per product group", () => {
    const t = shiftTotals({
      nozzles: [
        nozzle({ nozzleId: "a", fuelType: "Petrol" }),
        nozzle({ nozzleId: "b", fuelType: "Premium Petrol" }),
        nozzle({ nozzleId: "c", fuelType: "Diesel" }),
      ],
    });
    expect(t.litresByGroup.MS).toBe(200);
    expect(t.litresByGroup.HSD).toBe(100);
  });
});

describe("paymentsTotal", () => {
  it("sums the five modes", () => {
    expect(
      paymentsTotal({ cash: 100, card: 200, upi: 300, credit: 400, other: 500 })
    ).toBe(1500);
  });

  it("ignores junk in a field instead of returning NaN", () => {
    expect(paymentsTotal({ cash: "abc", card: 100 })).toBe(100);
  });
});

describe("classifyFuel", () => {
  it.each([
    ["Petrol", "MS"],
    ["Premium Petrol", "MS"],
    ["MS", "MS"],
    ["Diesel", "HSD"],
    ["HSD", "HSD"],
    ["CNG", "OTHER"],
  ])("maps %s to %s", (fuel, group) => {
    expect(classifyFuel(fuel)).toBe(group);
  });
});

describe("validateClosing", () => {
  it("accepts a plausible set of readings", () => {
    expect(validateClosing([nozzle()])).toHaveLength(0);
  });

  it("rejects a missing closing reading", () => {
    expect(validateClosing([nozzle({ closingReading: "" })]).length).toBeGreaterThan(0);
  });

  it("rejects a closing reading below the opening one", () => {
    expect(
      validateClosing([nozzle({ openingReading: 500, closingReading: 400 })]).length
    ).toBeGreaterThan(0);
  });

  it("rejects an implausibly large swing", () => {
    expect(
      validateClosing([nozzle({ openingReading: 0, closingReading: 60_000 })]).length
    ).toBeGreaterThan(0);
  });
});

describe("variance tolerance", () => {
  it("is small enough that a real shortfall is never absorbed", () => {
    expect(VARIANCE_TOLERANCE).toBeLessThanOrEqual(1);
  });
});

/**
 * Attendants are not entitled to know which co-worker holds a nozzle, so the
 * anonymous occupancy map has to be useful for availability while carrying no
 * identity at all. The database refuses the wider read regardless; this keeps
 * the client from ever rendering a name it should not have.
 */
describe("nozzle occupancy", () => {
  const openShifts = [
    {
      id: "shift-1",
      employeeName: "Ben Attendant",
      nozzles: [{ nozzleId: "n1" }, { nozzleId: "n2" }],
    },
  ];

  it("names the operator for owners and managers", () => {
    const map = nozzleOccupancy(openShifts);
    expect(map.n1.operator).toBe("Ben Attendant");
    expect(map.n1.shiftId).toBe("shift-1");
  });

  it("marks the same nozzles busy from bare ids", () => {
    const map = anonymousNozzleOccupancy(["n1", "n2"]);
    expect(Object.keys(map).sort()).toEqual(["n1", "n2"]);
    expect(map.n1.operator).toBe(ANONYMOUS_OPERATOR);
  });

  it("never exposes a co-worker's name or shift id", () => {
    const map = anonymousNozzleOccupancy(["n1"]);
    expect(map.n1.shiftId).toBeNull();
    expect(JSON.stringify(map)).not.toContain("Ben Attendant");
  });

  it("accepts the RPC's row shape as well as bare ids", () => {
    expect(anonymousNozzleOccupancy([{ nozzleId: "n7" }]).n7.operator).toBe(
      ANONYMOUS_OPERATOR
    );
  });

  it("ignores empty input rather than inventing availability", () => {
    expect(anonymousNozzleOccupancy()).toEqual({});
    expect(anonymousNozzleOccupancy([null, undefined])).toEqual({});
  });
});
