// @vitest-environment jsdom
/**
 * The owner/manager credit activity panel: today's figures from one aggregate
 * RPC, and the station ledger underneath it with the filters the database
 * applies. These pin the two things that matter financially — the summary is
 * read, not recomputed in the browser, and every filter change goes back to
 * SQL rather than slicing a local array.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import CreditActivity, { activityRange } from "./CreditActivity.jsx";

const api = vi.hoisted(() => ({
  creditDaySummary: vi.fn(),
  listCustomerTransactions: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  ...api,
  readableError: (error) => String(error?.message || error),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = [
  {
    id: "t1",
    customerId: "c1",
    customerName: "Ramesh Kumar",
    date: "2026-10-05",
    type: "credit",
    amount: 2500,
    status: "active",
    editCount: 0,
    recordedBy: "u1",
    recordedByName: "Ravi",
    recordedAt: "2026-10-05T10:42:00Z",
    shiftId: "sh-1",
    shiftLabel: "Ravi · 05 Oct",
  },
  {
    id: "t2",
    customerId: "c2",
    customerName: "Lakshmi Traders",
    date: "2026-10-05",
    type: "credit",
    amount: 5000,
    status: "voided",
    voidReason: "Duplicate entry",
    editCount: 0,
    recordedBy: "u2",
    recordedByName: "Suresh",
    recordedAt: "2026-10-05T11:18:00Z",
    shiftId: "sh-2",
    shiftLabel: "Suresh · 05 Oct",
  },
];

let container = null;
let root = null;

async function render() {
  container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <CreditActivity stationId="s1" />
      </LanguageProvider>
    );
  });
}

const click = async (element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

beforeEach(() => {
  api.creditDaySummary.mockResolvedValue({
    creditGiven: 42500,
    payments: 27500,
    netCredit: 15000,
    entries: 18,
    customers: 6,
    attendants: 4,
  });
  api.listCustomerTransactions.mockResolvedValue(ROWS);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("credit activity", () => {
  it("shows today's figures straight from the aggregate", async () => {
    await render();
    expect(api.creditDaySummary).toHaveBeenCalledWith("s1");
    const text = container.textContent;
    // The money figures count up through an animation, so the stable
    // assertion is the counts line plus the labels the figures sit under.
    expect(text).toContain("Credit given");
    expect(text).toContain("Net credit");
    expect(text).toContain("18 credit entries");
    expect(text).toContain("6 customers");
    expect(text).toContain("4 attendants");
  });

  it("marks a voided entry and shows its reason", async () => {
    await render();
    const voided = container.querySelector(".st-row--voided");
    expect(voided).toBeTruthy();
    expect(voided.textContent).toContain("Duplicate entry");
  });

  it("asks the database again when the status filter changes", async () => {
    await render();
    const chip = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Voided"
    );
    await click(chip);
    expect(api.listCustomerTransactions).toHaveBeenLastCalledWith(
      "s1",
      expect.objectContaining({ status: "voided" })
    );
  });

  it("names the attendants and shifts it can filter by", async () => {
    await render();
    const options = [...container.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toContain("Ravi");
    expect(options).toContain("Suresh · 05 Oct");
  });
});

describe("activityRange", () => {
  const today = new Date(2026, 9, 7); // Wednesday 7 Oct 2026

  it("defaults to today", () => {
    expect(activityRange("today", today)).toEqual({
      from: "2026-10-07",
      to: "2026-10-07",
    });
  });

  it("gives yesterday as a single day", () => {
    expect(activityRange("yesterday", today)).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("counts the week from Monday", () => {
    expect(activityRange("week", today)).toEqual({
      from: "2026-10-05",
      to: "2026-10-07",
    });
  });

  it("runs the month from the first", () => {
    expect(activityRange("month", today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("keeps whatever the operator typed for a custom range", () => {
    const custom = { from: "2026-01-01", to: "2026-01-31" };
    expect(activityRange("custom", today, custom)).toEqual(custom);
  });
});
