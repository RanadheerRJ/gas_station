// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import { ThemeProvider } from "../../state/ThemeContext.jsx";
import { avatarHue, initials } from "../../lib/avatar.js";
import { elapsedLabel, elapsedMinutes } from "../../lib/elapsed.js";
import { SHIFT_STATUS } from "../../lib/shiftMath.js";
import ShiftsList from "./ShiftsList.jsx";
import TodayHistory from "../today/TodayHistory.jsx";
import { SHIFT_TAB, bucketCounts, filterShifts, shiftBucket } from "./ShiftTabs.jsx";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listShifts: api.listShifts,
    readableError: (err) => String(err?.message || err),
  };
});

const auth = vi.hoisted(() => ({
  profile: { uid: "u-mgr", role: "manager", name: "Meera", username: "meera" },
}));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    stations: [{ id: "s1", name: "City Centre" }],
    station: { id: "s1", name: "City Centre" },
    stationId: "s1",
    setStation: vi.fn(),
    loading: false,
    link: (to) => ({ pathname: to, search: "" }),
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOZZLES = [
  {
    nozzleId: "n1",
    label: "P1 · N1",
    fuelType: "MS",
    openingReading: "1000",
    closingReading: "1250",
    price: "100",
  },
];

const LIVE_SHIFT = {
  id: "sh-live",
  status: SHIFT_STATUS.OPEN,
  userId: "u-1",
  employeeName: "Suresh Babu",
  date: "2026-10-13",
  startTime: "2026-10-13T08:00:00.000Z",
  nozzles: [
    {
      nozzleId: "n1",
      label: "P1 · N1",
      fuelType: "MS",
      openingReading: "1000",
      price: "100",
    },
  ],
  expenses: [],
  payments: {},
  testing: {},
};

const PENDING_SHIFT = {
  id: "sh-pending",
  status: SHIFT_STATUS.PENDING_REVIEW,
  userId: "u-2",
  employeeName: "Ravi Kumar",
  date: "2026-10-13",
  startTime: "2026-10-13T05:00:00.000Z",
  endTime: "2026-10-13T09:30:00.000Z",
  nozzles: NOZZLES,
  expenses: [],
  payments: { cash: "25000", card: "", upi: "", credit: "", other: "" },
  testing: {},
};

const REJECTED_SHIFT = {
  ...PENDING_SHIFT,
  id: "sh-rejected",
  status: SHIFT_STATUS.REJECTED,
  employeeName: "Anitha Rao",
  startTime: "2026-10-12T18:00:00.000Z",
  endTime: "2026-10-12T22:00:00.000Z",
};

const APPROVED_SHIFT = {
  ...PENDING_SHIFT,
  id: "sh-approved",
  status: SHIFT_STATUS.APPROVED,
  employeeName: "Kiran Verma",
  approvedAt: "2026-10-12T15:00:00.000Z",
  startTime: "2026-10-12T06:00:00.000Z",
  endTime: "2026-10-12T14:00:00.000Z",
};

describe("shiftBucket & bucketCounts", () => {
  it("groups open into live, pending & rejected into review, and approved into closed", () => {
    expect(shiftBucket(LIVE_SHIFT)).toBe(SHIFT_TAB.LIVE);
    expect(shiftBucket(PENDING_SHIFT)).toBe(SHIFT_TAB.REVIEW);
    expect(shiftBucket(REJECTED_SHIFT)).toBe(SHIFT_TAB.REVIEW);
    expect(shiftBucket(APPROVED_SHIFT)).toBe(SHIFT_TAB.CLOSED);

    expect(
      bucketCounts([LIVE_SHIFT, PENDING_SHIFT, REJECTED_SHIFT, APPROVED_SHIFT])
    ).toEqual({
      all: 4,
      live: 1,
      review: 2,
      closed: 1,
    });
  });

  it("pins live shifts to the top of the All shelf and filters each shelf cleanly", () => {
    const all = filterShifts([APPROVED_SHIFT, LIVE_SHIFT, PENDING_SHIFT], SHIFT_TAB.ALL);
    expect(all.map((s) => s.id)).toEqual(["sh-live", "sh-pending", "sh-approved"]);
    expect(
      filterShifts([LIVE_SHIFT, PENDING_SHIFT, APPROVED_SHIFT], SHIFT_TAB.LIVE).map(
        (s) => s.id
      )
    ).toEqual(["sh-live"]);
    expect(
      filterShifts(
        [LIVE_SHIFT, PENDING_SHIFT, REJECTED_SHIFT, APPROVED_SHIFT],
        SHIFT_TAB.REVIEW
      ).map((s) => s.id)
    ).toEqual(["sh-pending", "sh-rejected"]);
    expect(
      filterShifts([LIVE_SHIFT, PENDING_SHIFT, APPROVED_SHIFT], SHIFT_TAB.CLOSED).map(
        (s) => s.id
      )
    ).toEqual(["sh-approved"]);
  });
});

describe("avatar & elapsed helpers", () => {
  it("extracts up to two uppercase initials and a deterministic hue", () => {
    expect(initials("Suresh Babu")).toBe("SB");
    expect(initials("Ravi")).toBe("R");
    expect(initials("  ")).toBe("?");
    expect(avatarHue("Suresh Babu")).toBe(avatarHue("Suresh Babu"));
  });

  it("formats elapsed durations in hours and minutes", () => {
    const fmt = (key, vars) =>
      key === "shifts.elapsedHm" ? `${vars.hours}h ${vars.minutes}m` : `${vars.minutes}m`;
    expect(elapsedMinutes(-5000)).toBe(0);
    expect(elapsedLabel(45 * 60_000, fmt)).toBe("45m");
    expect(elapsedLabel(135 * 60_000, fmt)).toBe("2h 15m");
  });
});

describe("ShiftsList & TodayHistory tabbed UI", () => {
  let container = null;
  let root = null;

  async function settle() {
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  async function mount(element, path = "/station") {
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <ThemeProvider>
            <LanguageProvider>
              <Routes>
                <Route path="*" element={element} />
              </Routes>
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );
    });
    await settle();
  }

  beforeEach(() => {
    auth.profile = { uid: "u-mgr", role: "manager", name: "Meera", username: "meera" };
    api.listShifts.mockResolvedValue([
      LIVE_SHIFT,
      PENDING_SHIFT,
      REJECTED_SHIFT,
      APPROVED_SHIFT,
    ]);
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

  it("filters between All, Live, Review, and Closed tabs on ShiftsList", async () => {
    await mount(<ShiftsList />);

    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "All4",
      "Live1",
      "Review2",
      "Closed1",
    ]);

    // Click Live tab: only Suresh Babu's live shift is visible.
    await act(async () => {
      tabs[1].click();
    });
    expect(container.textContent).toContain("Suresh Babu");
    expect(container.textContent).not.toContain("Kiran Verma");

    // Click Review tab: Ravi Kumar and Anitha Rao are visible, not Kiran Verma.
    await act(async () => {
      tabs[2].click();
    });
    expect(container.textContent).toContain("Ravi Kumar");
    expect(container.textContent).toContain("Anitha Rao");
    expect(container.textContent).not.toContain("Kiran Verma");

    // Click Closed tab: only Kiran Verma is visible.
    await act(async () => {
      tabs[3].click();
    });
    expect(container.textContent).toContain("Kiran Verma");
    expect(container.textContent).not.toContain("Ravi Kumar");
  });

  it("renders the three history tabs (All, Review, Closed) for an attendant", async () => {
    auth.profile = {
      uid: "u-2",
      role: "attendant",
      name: "Ravi Kumar",
      username: "ravi",
    };
    api.listShifts.mockResolvedValue([
      LIVE_SHIFT,
      PENDING_SHIFT,
      { ...APPROVED_SHIFT, userId: "u-2", employeeName: "Ravi Kumar" },
    ]);

    await mount(<TodayHistory />, "/today/history");
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["All2", "Review1", "Closed1"]);
  });
});
