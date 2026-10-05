// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import { money } from "../../lib/format.js";
import { shiftTotals } from "../../lib/shiftMath.js";
import { SettledShiftDetail } from "./ShiftDetail.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SHIFT = {
  id: "sh-review",
  status: "pending_review",
  date: "2026-10-05",
  employeeName: "Ravi",
  closedByName: "Ravi",
  nozzles: [
    {
      nozzleId: "n1",
      label: "P1 · N1",
      fuelType: "MS",
      openingReading: "100",
      closingReading: "110",
      price: "100",
    },
  ],
  expenses: [{ label: "Tea", amount: "50" }],
  testing: { MS: "0", HSD: "0" },
  payments: { cash: "700", card: "50", upi: "0", credit: "100", other: "0" },
  creditSales: [{ name: "Kumar", phone: "9999999999", amount: "100" }],
};

let container;
let root;

function renderDetail({ canReview }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <SettledShiftDetail
            shift={SHIFT}
            customers={[]}
            canReview={canReview}
            busy={false}
            onRevise={vi.fn().mockResolvedValue(true)}
            onReopen={vi.fn().mockResolvedValue(true)}
            onApprove={vi.fn().mockResolvedValue(true)}
            onReject={vi.fn().mockResolvedValue(true)}
          />
        </LanguageProvider>
      </MemoryRouter>
    );
  });
}

function labelledMoney(scope, label, value) {
  const expected = money(Math.abs(value));
  return Array.from(scope.querySelectorAll(".money")).find((element) => {
    const accessible = element.getAttribute("aria-label") || "";
    return accessible.startsWith(`${label},`) && accessible.includes(expected);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  window.localStorage.clear();
  root = null;
  container = null;
});

describe.each(["owner", "manager"])("%s shift review", (role) => {
  it("shows the existing totals in the summary, legend, and sticky figures", () => {
    renderDetail({ canReview: true });
    const totals = shiftTotals(SHIFT);
    const summary = container.querySelector('[data-testid="review-summary"]');

    expect(summary, `${role} summary`).toBeTruthy();
    expect(labelledMoney(summary, "Total sales", totals.gross)).toBeTruthy();
    expect(labelledMoney(summary, "Cash", totals.payments.cash)).toBeTruthy();
    expect(labelledMoney(summary, "Card", totals.payments.card)).toBeTruthy();
    expect(
      labelledMoney(summary, "Given on credit", totals.payments.credit)
    ).toBeTruthy();
    expect(labelledMoney(summary, "Expenses", totals.expensesTotal)).toBeTruthy();
    expect(labelledMoney(summary, "Testing", totals.testingTotal)).toBeTruthy();
    expect(labelledMoney(summary, "Cash expected", totals.handover)).toBeTruthy();
    expect(labelledMoney(summary, "Cash counted", totals.payments.cash)).toBeTruthy();
    expect(labelledMoney(summary, "Variance", totals.variance)).toBeTruthy();

    expect(container.querySelector(".money-legend__toggle")).toBeTruthy();
    expect(container.querySelector('[data-testid="review-action-bar"]')).toBeTruthy();
    expect(container.querySelector('[data-review-figure="sales"]')).toBeTruthy();
    expect(container.querySelector('[data-review-figure="received"]')).toBeTruthy();
    expect(container.querySelector('[data-review-figure="credit"]')).toBeTruthy();
    expect(container.querySelector('[data-review-figure="variance"]')).toBeTruthy();
  });
});

describe("review action safety", () => {
  it("keeps Approve enabled when cash is short and shows attention copy", () => {
    renderDetail({ canReview: true });

    const approve = container.querySelector("button.review-approve");
    expect(approve).toBeTruthy();
    expect(approve.disabled).toBe(false);
    expect(container.querySelector(".review-attention").textContent).toContain(
      "Cash is short"
    );
  });

  it("remembers the optional legend state on this device", () => {
    renderDetail({ canReview: true });

    const toggle = container.querySelector(".money-legend__toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".money-legend__items")).toBeTruthy();
    expect(window.localStorage.getItem("petrav.money-legend.open")).toBe("1");
  });
});

describe("attendant shift detail", () => {
  it("does not render reviewer summary, legend, sticky bar, or approval fields", () => {
    renderDetail({ canReview: false });

    expect(container.querySelector('[data-testid="review-summary"]')).toBeNull();
    expect(container.querySelector(".money-legend")).toBeNull();
    expect(container.querySelector('[data-testid="review-action-bar"]')).toBeNull();
    expect(container.querySelector("button.review-approve")).toBeNull();
    expect(container.textContent).not.toContain("What you are approving");
    expect(container.textContent).toContain("Kumar");
  });
});
