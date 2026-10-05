// @vitest-environment jsdom
/**
 * The running-shift screen: the glance layer an attendant checks between
 * customers. Pins the elapsed figure, the nozzle chips, the opening meters
 * it started from, and the single pinned primary — Close shift.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import ShiftRun from "./ShiftRun.jsx";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listShifts: api.listShifts,
    readableError: (error) => String(error?.message || error),
  };
});

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: { uid: "u-att", role: "attendant", name: "Ravi" } }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    station: { name: "City Centre" },
    stationId: "s1",
    loading: false,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OPEN_SHIFT = {
  id: "sh-1",
  status: "open",
  userId: "u-att",
  employeeName: "Ravi",
  date: "2026-10-05",
  startTime: new Date(Date.now() - 125 * 60 * 1000).toISOString(), // 2h 5m ago
  nozzles: [
    {
      nozzleId: "n1",
      label: "P1 · N1",
      fuelType: "MS",
      openingReading: "1000",
      price: "100",
    },
    {
      nozzleId: "n2",
      label: "P1 · N2",
      fuelType: "HSD",
      openingReading: "2000",
      price: "90",
    },
  ],
  expenses: [{ label: "Tea", amount: "40" }],
};

let container = null;
let root = null;

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountRun() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={["/today/shift/sh-1"]}>
        <LanguageProvider>
          <Routes>
            <Route path="/today/shift/:id" element={<ShiftRun />} />
            <Route path="/today" element={<div data-testid="today-home" />} />
            <Route path="/today/shift/:id/close" element={<div data-testid="close" />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    );
  });
  await settle();
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  api.listShifts.mockResolvedValue([OPEN_SHIFT]);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

describe("the running shift screen", () => {
  it("shows the elapsed time since the shift started", async () => {
    await mountRun();
    const elapsed = container.querySelector('[data-testid="run-elapsed"]');
    expect(elapsed.textContent).toContain("2h");
    expect(elapsed.textContent).toContain("5m");
  });

  it("lists the nozzles on the shift as chips, fuel named", async () => {
    await mountRun();
    const chips = container.querySelector(".status-card__chips");
    expect(chips.textContent).toContain("P1 · N1");
    expect(chips.textContent).toContain("P1 · N2");
    const tags = [...container.querySelectorAll(".run-reading .fuel-tag")];
    expect(tags.map((tag) => tag.textContent)).toEqual(["MS", "HSD"]);
  });

  it("shows each opening meter reading and rate", async () => {
    await mountRun();
    expect(container.textContent).toContain("1,000.00");
    expect(container.textContent).toContain("₹ 100.00/L");
  });

  it("shows the drawer expenses as spent money, with a way to add more", async () => {
    await mountRun();
    const expenseMoney = container.querySelector(".card--flush .money--out");
    expect(expenseMoney.textContent).toContain("40.00");

    const addExpense = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Add expense"
    );
    await click(addExpense);
    // The sheet opened over the screen.
    expect(container.querySelector(".sheet__head h2").textContent).toContain("Expenses");
  });

  it("pins exactly one primary action: Close shift", async () => {
    await mountRun();
    const primary = container.querySelectorAll(".action-bar .cta");
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent.trim()).toBe("Close shift");
    await click(primary[0]);
    expect(container.querySelector('[data-testid="close"]')).toBeTruthy();
  });
});
