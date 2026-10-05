// @vitest-environment jsdom
/**
 * The attendant's Today screen in its three working states, pinned.
 *
 * This is the screen a phone opens onto at the start of a shift: it has to
 * say, without scrolling or reading, whether a shift is running, whether
 * the owner sent one back, and what the one big button does. These tests
 * drive the real component with the data the screen already loads, and
 * also pin the privacy posture: a co-worker's shift arriving in the list
 * must not surface a name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import TodayHome from "./TodayHome.jsx";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listPumps: vi.fn(),
  listNozzleOccupancy: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listShifts: api.listShifts,
    listPumps: api.listPumps,
    listNozzleOccupancy: api.listNozzleOccupancy,
    readableError: (error) => String(error?.message || error),
  };
});

const auth = vi.hoisted(() => ({
  profile: { uid: "u-att", role: "attendant", name: "Ravi" },
}));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    station: { name: "City Centre" },
    stationId: "s1",
    loading: false,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MY_OPEN_SHIFT = {
  id: "sh-open",
  status: "open",
  userId: "u-att",
  employeeName: "Ravi",
  date: "2026-10-05",
  startTime: "2026-10-05T06:05:00.000Z",
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
  expenses: [],
};

const MY_REJECTED_SHIFT = {
  ...MY_OPEN_SHIFT,
  id: "sh-back",
  status: "rejected",
  rejectedByName: "Owner",
  rejectionReason: "Cash does not match the readings",
  nozzles: MY_OPEN_SHIFT.nozzles.map((nozzle, index) => ({
    ...nozzle,
    closingReading: index === 0 ? "1500" : "2500",
  })),
};

// RLS keeps this out of an attendant's list; if it ever arrived anyway, the
// screen must still not say who it belongs to.
const CO_WORKER_SHIFT = {
  ...MY_OPEN_SHIFT,
  id: "sh-other",
  userId: "u-other",
  employeeName: "Co-Worker Ramesh",
};

const PUMPS = [{ id: "p1", name: "Pump 1" }];
const NOZZLES = [
  { id: "n1", pumpId: "p1", name: "N1", fuelType: "MS", lastReading: "1000" },
  { id: "n2", pumpId: "p1", name: "N2", fuelType: "HSD", lastReading: "2000" },
];

let container = null;
let root = null;

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountToday() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={["/today"]}>
        <LanguageProvider>
          <Routes>
            <Route path="/today" element={<TodayHome />} />
            <Route path="/today/history/:id/edit" element={<div data-testid="edit" />} />
            <Route path="/today/shift/:id" element={<div data-testid="run" />} />
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
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.listShifts.mockResolvedValue([]);
  api.listPumps.mockResolvedValue({ pumps: PUMPS, nozzles: NOZZLES });
  api.listNozzleOccupancy.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("attendant Today: no shift running", () => {
  it("shows the no-shift card and a working Start shift button", async () => {
    await mountToday();

    expect(container.textContent).toContain("No shift running");
    expect(container.textContent).toContain("nozzles free right now");

    const start = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Start shift"
    );
    expect(start).toBeTruthy();
    expect(start.disabled).toBe(false);
  });

  it("disables Start when every nozzle is busy, without hiding why", async () => {
    api.listNozzleOccupancy.mockResolvedValue(["n1", "n2"]);
    await mountToday();

    expect(container.textContent).toContain("Every nozzle is in an open shift");
    const start = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Start shift"
    );
    expect(start.disabled).toBe(true);
  });
});

describe("attendant Today: shift running", () => {
  it("leads with the running card, nozzle chips and a Continue button", async () => {
    api.listShifts.mockResolvedValue([MY_OPEN_SHIFT]);
    await mountToday();

    expect(container.textContent).toContain("Running since");
    // Chips name each nozzle on the shift.
    expect(container.querySelector(".status-card__chips").textContent).toContain(
      "P1 · N1"
    );
    expect(container.querySelector(".status-card__chips").textContent).toContain(
      "P1 · N2"
    );

    const continueButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Continue shift"
    );
    expect(continueButton).toBeTruthy();
    // The one primary action is pinned, and it is not Start.
    const start = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Start shift"
    );
    expect(start).toBeUndefined();
  });

  it("shows the drawer expenses so far as a spent-money figure", async () => {
    api.listShifts.mockResolvedValue([
      { ...MY_OPEN_SHIFT, expenses: [{ label: "Tea", amount: "40" }] },
    ]);
    await mountToday();

    const expenses = container.querySelector(".status-card__figures .money");
    expect(expenses.className).toContain("money--out");
    expect(expenses.textContent).toContain("40.00");
  });
});

describe("attendant Today: shift sent back", () => {
  it("shows the reason first, with an Edit & resubmit button", async () => {
    api.listShifts.mockResolvedValue([MY_REJECTED_SHIFT, CO_WORKER_SHIFT]);
    await mountToday();

    // The sent-back card is the first thing in the content.
    const firstCard = container.querySelector(".today-dashboard .card");
    expect(firstCard.className).toContain("sentback-card");
    expect(firstCard.textContent).toContain("Sent back by Owner");
    expect(firstCard.textContent).toContain("Cash does not match the readings");

    const edit = firstCard.querySelector("a.sentback-card__action");
    expect(edit.textContent.trim()).toBe("Edit & resubmit");
    expect(edit.getAttribute("href")).toBe("/today/history/sh-back/edit");
  });

  it("never names a co-worker, even if their shift arrives in the list", async () => {
    api.listShifts.mockResolvedValue([MY_OPEN_SHIFT, CO_WORKER_SHIFT]);
    await mountToday();
    expect(container.textContent).not.toContain("Co-Worker Ramesh");
  });
});

describe("attendant Today: just-submitted confirmation", () => {
  it("shows the sent-for-review note once, then lets it go", async () => {
    window.sessionStorage.setItem("petrav.flash.shiftSent", "sh-1");
    await mountToday();

    const confirmation = container.querySelector('[data-testid="sent-confirmation"]');
    expect(confirmation).toBeTruthy();
    expect(confirmation.textContent).toContain("Sent for review");
    expect(confirmation.textContent).toContain("start your next shift");

    const back = [...confirmation.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Back to today"
    );
    await click(back);
    expect(container.querySelector('[data-testid="sent-confirmation"]')).toBeNull();
  });

  it("shows no confirmation without the flash note", async () => {
    await mountToday();
    expect(container.querySelector('[data-testid="sent-confirmation"]')).toBeNull();
  });
});
