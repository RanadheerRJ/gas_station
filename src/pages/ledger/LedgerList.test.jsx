// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { daysInMonth, groupDaysByWeek, monthTotals } from "./LedgerList.jsx";

const day = (date, over = {}) => ({
  date,
  sales: 1000,
  declared: 900,
  expenses: 100,
  litres: 50,
  ...over,
});

describe("ledger month helpers", () => {
  it("filters days to the selected month", () => {
    const days = [day("2026-10-02"), day("2026-09-30")];
    expect(daysInMonth(days, "2026-10").map((d) => d.date)).toEqual(["2026-10-02"]);
  });

  it("totals sales, collections, expenses and net", () => {
    expect(monthTotals([day("2026-10-02"), day("2026-10-03")])).toEqual({
      sales: 2000,
      collections: 1800,
      expenses: 200,
      net: 1800,
      litres: 100,
    });
  });

  it("groups days into week-of-month buckets", () => {
    const groups = groupDaysByWeek([day("2026-10-02"), day("2026-10-09")]);
    expect(groups.map((g) => g.week)).toEqual([0, 1]);
    expect(groups[1].items).toHaveLength(1);
  });
});
