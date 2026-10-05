// @vitest-environment jsdom
/**
 * The credit book overview.
 *
 * The figures in the header card are the ones an owner acts on — how much is
 * owed, how concentrated it is, and how many accounts have gone quiet — so
 * they are pinned here rather than left to a visual check. The sort and the
 * ageing rule are pinned for the same reason: both decide which customer a
 * manager calls next.
 */

import { describe, expect, it } from "vitest";
import {
  accountAge,
  avatarHue,
  creditBase,
  creditInsights,
  daysSince,
  lastMovement,
  sortCustomers,
} from "./CreditList.jsx";

const NOW = new Date("2026-10-05T10:00:00Z");

const customer = (over = {}) => ({
  id: over.id || "c",
  name: over.name || "Someone",
  outstandingBalance: 0,
  transactions: [],
  ...over,
});

const tx = (type, amount, date, extra = {}) => ({
  type,
  amount,
  date,
  recordedAt: `${date}T09:00:00Z`,
  status: "active",
  ...extra,
});

describe("creditBase", () => {
  it("keeps an owner inside the owner area", () => {
    expect(creditBase("owner")).toBe("/owner/credit");
    expect(creditBase("manager")).toBe("/station/credit");
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince("2026-09-05T10:00:00Z", NOW)).toBe(30);
  });

  it("is null for a missing or unreadable date", () => {
    expect(daysSince(null, NOW)).toBe(null);
    expect(daysSince("not a date", NOW)).toBe(null);
  });
});

describe("lastMovement", () => {
  it("ignores voided entries, which no longer represent money", () => {
    const c = customer({
      transactions: [
        tx("credit", 900, "2026-10-04", { status: "voided" }),
        tx("credit", 500, "2026-10-01"),
        tx("payment", 200, "2026-09-30"),
      ],
    });
    expect(lastMovement(c).credit.amount).toBe(500);
    expect(lastMovement(c).payment.amount).toBe(200);
  });
});

describe("accountAge", () => {
  it("says nothing about an account that owes nothing", () => {
    expect(accountAge(customer({ outstandingBalance: 0 }), NOW).tone).toBe(null);
  });

  it("flags a balance with no payment for two months", () => {
    const c = customer({
      outstandingBalance: 4000,
      transactions: [tx("payment", 100, "2026-07-01"), tx("credit", 4000, "2026-08-02")],
    });
    expect(accountAge(c, NOW)).toMatchObject({ tone: "late", paid: true });
  });

  it("warns a month out, and stays quiet inside it", () => {
    const watch = customer({
      outstandingBalance: 1000,
      transactions: [tx("payment", 100, "2026-09-01")],
    });
    const fresh = customer({
      outstandingBalance: 1000,
      transactions: [tx("payment", 100, "2026-10-01")],
    });
    expect(accountAge(watch, NOW).tone).toBe("watch");
    expect(accountAge(fresh, NOW).tone).toBe(null);
  });

  it("ages an account that has never paid from its oldest credit", () => {
    const c = customer({
      outstandingBalance: 2500,
      transactions: [tx("credit", 2500, "2026-06-01")],
    });
    expect(accountAge(c, NOW)).toMatchObject({ tone: "late", paid: false });
  });
});

describe("creditInsights", () => {
  const book = [
    customer({ id: "a", name: "A", outstandingBalance: 6000 }),
    customer({ id: "b", name: "B", outstandingBalance: 2000 }),
    customer({ id: "c", name: "C", outstandingBalance: 1500 }),
    customer({ id: "d", name: "D", outstandingBalance: 500 }),
    customer({ id: "e", name: "E", outstandingBalance: 0 }),
    customer({
      id: "f",
      name: "F",
      outstandingBalance: 900,
      archivedAt: "2026-01-01T00:00:00Z",
    }),
  ];

  it("totals only the active accounts", () => {
    expect(creditInsights(book, NOW).total).toBe(10000);
  });

  it("keeps archived money out of the headline but still reports it", () => {
    expect(creditInsights(book, NOW).archivedTotal).toBe(900);
  });

  it("counts who owes and who is square", () => {
    const i = creditInsights(book, NOW);
    expect(i.customers).toBe(5);
    expect(i.owing).toBe(4);
    expect(i.settled).toBe(1);
  });

  it("states how much of the exposure sits with the three largest accounts", () => {
    const i = creditInsights(book, NOW);
    expect(i.topCount).toBe(3);
    expect(i.topShare).toBe(95); // (6000 + 2000 + 1500) / 10000
  });

  it("is safe on an empty book", () => {
    expect(creditInsights([], NOW)).toMatchObject({ total: 0, topShare: 0, owing: 0 });
  });
});

describe("sortCustomers", () => {
  const rows = [
    customer({ id: "a", name: "Zahir", outstandingBalance: 100 }),
    customer({
      id: "b",
      name: "Anand",
      outstandingBalance: 900,
      transactions: [tx("credit", 900, "2026-10-04")],
    }),
    customer({
      id: "c",
      name: "Meera",
      outstandingBalance: 400,
      transactions: [tx("credit", 400, "2026-10-05")],
    }),
  ];

  it("puts the biggest exposure first by default", () => {
    expect(sortCustomers(rows, "balance").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("orders by name when asked", () => {
    expect(sortCustomers(rows, "name").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("orders by the newest movement when asked", () => {
    expect(sortCustomers(rows, "recent").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate the array it was given", () => {
    const copy = [...rows];
    sortCustomers(rows, "name");
    expect(rows).toEqual(copy);
  });
});

describe("avatarHue", () => {
  it("is stable for a name and spread across the wheel", () => {
    expect(avatarHue("Ramesh Kumar")).toBe(avatarHue("Ramesh Kumar"));
    expect(avatarHue("Ramesh Kumar")).not.toBe(avatarHue("Lakshmi Traders"));
    expect(avatarHue("")).toBeGreaterThanOrEqual(0);
    expect(avatarHue("Anything")).toBeLessThan(360);
  });
});
