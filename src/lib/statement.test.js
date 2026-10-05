import { describe, expect, it } from "vitest";
import { buildStatement, groupByDay, ledgerEntries, periodRange } from "./statement.js";
import { statementReport } from "./export.js";

const TX = [
  {
    id: "a",
    date: "2026-09-20",
    type: "credit",
    amount: 1000,
    recordedAt: "2026-09-20T05:00:00Z",
  },
  {
    id: "b",
    date: "2026-10-01",
    type: "credit",
    amount: 500,
    note: "Diesel 200L",
    recordedAt: "2026-10-01T06:30:00Z",
    recordedByName: "Mia",
  },
  {
    id: "c",
    date: "2026-10-01",
    type: "payment",
    amount: 200,
    recordedAt: "2026-10-01T09:00:00Z",
    recordedByName: "Mia",
  },
  {
    id: "d",
    date: "2026-10-04",
    type: "credit",
    amount: 300,
    recordedAt: "2026-10-04T04:00:00Z",
  },
];

describe("periodRange", () => {
  const today = new Date("2026-10-05T10:00:00Z");

  it("opens on the month to date", () => {
    expect(periodRange("thisMonth", today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    });
  });

  it("covers the whole of last month", () => {
    expect(periodRange("lastMonth", today)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("rolls back to the first of the month two months ago", () => {
    expect(periodRange("last3Months", today)).toEqual({
      from: "2026-08-01",
      to: "2026-10-05",
    });
  });

  it("leaves a custom range in the caller's hands", () => {
    const current = { from: "2026-01-02", to: "2026-01-09" };
    expect(periodRange("custom", today, current)).toEqual(current);
  });

  it("crosses the new year when January asks for last month", () => {
    expect(periodRange("lastMonth", new Date("2026-01-14T00:00:00Z"))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("ledgerEntries", () => {
  it("runs the balance oldest first, credit up and payment down", () => {
    expect(ledgerEntries(TX).map((e) => e.balance)).toEqual([1000, 1500, 1300, 1600]);
  });
});

describe("buildStatement", () => {
  const range = { from: "2026-10-01", to: "2026-10-05" };

  it("opens on the balance carried into the period", () => {
    expect(buildStatement({ transactions: TX, range }).opening).toBe(1000);
  });

  it("lists the period newest first and closes on the final balance", () => {
    const s = buildStatement({ transactions: TX, range });
    expect(s.rows.map((r) => r.id)).toEqual(["d", "c", "b"]);
    expect(s.closing).toBe(1600);
  });

  it("totals credit given, payments received and the net movement", () => {
    expect(buildStatement({ transactions: TX, range }).totals).toEqual({
      creditGiven: 800,
      paymentsReceived: 200,
      net: 600,
    });
  });

  it("keeps running balances true even when the view is filtered", () => {
    const s = buildStatement({ transactions: TX, range, filter: "payments" });
    expect(s.rows.map((r) => [r.id, r.balance])).toEqual([["c", 1300]]);
    expect(s.totals.creditGiven).toBe(0);
    expect(s.closing).toBe(1600);
  });

  it("reports an empty period without inventing rows", () => {
    const s = buildStatement({
      transactions: TX,
      range: { from: "2026-11-01", to: "2026-11-30" },
    });
    expect(s.rows).toEqual([]);
    expect(s.opening).toBe(1600);
    expect(s.closing).toBe(1600);
  });
});

describe("groupByDay", () => {
  it("keeps one group per day, in the order the rows arrive", () => {
    const rows = buildStatement({
      transactions: TX,
      range: { from: "2026-10-01", to: "2026-10-05" },
    }).rows;
    expect(groupByDay(rows).map((g) => [g.day, g.rows.length])).toEqual([
      ["2026-10-04", 1],
      ["2026-10-01", 2],
    ]);
  });
});

describe("statementReport", () => {
  const range = { from: "2026-10-01", to: "2026-10-05" };
  const customer = { name: "Blue Haul", phone: "9000000001", transactions: TX };

  it("exports exactly the period on screen, oldest first", () => {
    const report = statementReport({ customer, range, stationName: "City Ctr" });
    expect(report.rows[0]).toEqual([
      "2026-10-01",
      "",
      "Opening balance",
      "",
      "",
      "",
      "1000.00",
    ]);
    expect(report.rows.map((row) => row[2])).toEqual([
      "Opening balance",
      "Diesel 200L",
      "Payment received",
      "Credit given",
      "Closing balance",
      "Totals",
    ]);
    expect(report.rows[report.rows.length - 1]).toEqual([
      "",
      "",
      "Totals",
      "",
      "800.00",
      "200.00",
      "600.00",
    ]);
  });

  it("follows the screen's filter so a download matches the display", () => {
    const report = statementReport({ customer, range, filter: "credit" });
    expect(report.rows.map((row) => row[2])).toEqual([
      "Opening balance",
      "Diesel 200L",
      "Credit given",
      "Closing balance",
      "Totals",
    ]);
  });
});
