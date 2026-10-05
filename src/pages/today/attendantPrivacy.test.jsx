// @vitest-environment jsdom
/**
 * The attendant's screens never say what they must not.
 *
 * RLS is the real boundary — this file cannot grant or revoke anything. What
 * it can do is prove the presentation layer holds the line too: even if a
 * forbidden value arrived in a payload (a co-worker's name on a shift row, a
 * balance on a directory customer, another station's data), no attendant
 * screen renders it. Every screen the role can reach is mounted with data
 * that deliberately over-supplies, and each assertion asks only what the UI
 * draws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import { ThemeProvider } from "../../state/ThemeContext.jsx";
import TodayHome from "./TodayHome.jsx";
import StartShift from "./StartShift.jsx";
import ShiftRun from "./ShiftRun.jsx";
import TodayHistory from "./TodayHistory.jsx";
import TodayAccount from "./TodayAccount.jsx";
import CloseShift from "../shifts/CloseShift.jsx";
import ShiftDetail from "../shifts/ShiftDetail.jsx";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listPumps: vi.fn(),
  listNozzleOccupancy: vi.fn(),
  listCustomerDirectory: vi.fn(),
  listCustomers: vi.fn(),
  listStations: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listShifts: api.listShifts,
    listPumps: api.listPumps,
    listNozzleOccupancy: api.listNozzleOccupancy,
    listCustomerDirectory: api.listCustomerDirectory,
    listCustomers: api.listCustomers,
    listStations: api.listStations,
    readableError: (error) => String(error?.message || error),
  };
});

const auth = vi.hoisted(() => ({
  profile: { uid: "u-att", role: "attendant", name: "Ravi", username: "ravi" },
}));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    stations: [{ id: "s1", name: "City Centre" }],
    station: { id: "s1", name: "City Centre" },
    stationId: "s1",
    loading: false,
    link: (to) => ({ pathname: to, search: "" }),
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MY_NOZZLES = [
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
];

// Over-supplied on purpose: fields and rows RLS keeps away from an
// attendant, planted so a regression in any screen would render them.
const MY_OPEN_SHIFT = {
  id: "sh-open",
  status: "open",
  userId: "u-att",
  employeeName: "Ravi",
  date: "2026-10-05",
  startTime: "2026-10-05T06:05:00.000Z",
  nozzles: MY_NOZZLES,
  expenses: [{ label: "Tea", amount: "40" }],
  creditSales: [
    { customerId: "c1", name: "Kumar Transports", phone: "9000000000", amount: "500" },
  ],
  payments: { cash: "1000", card: "", upi: "", credit: "500", other: "" },
  testing: { MS: "50", HSD: "" },
};

const MY_REJECTED_SHIFT = {
  ...MY_OPEN_SHIFT,
  id: "sh-back",
  status: "rejected",
  rejectedByName: "The Owner",
  rejectionReason: "Cash does not match the readings",
  nozzles: MY_NOZZLES.map((nozzle, index) => ({
    ...nozzle,
    closingReading: index === 0 ? "1500" : "2500",
  })),
};

const MY_SETTLED_SHIFT = {
  ...MY_OPEN_SHIFT,
  id: "sh-done",
  status: "pending_review",
};

// A co-worker's shift. Attendants must never see the name on it.
const CO_WORKER_SHIFT = {
  ...MY_SETTLED_SHIFT,
  id: "sh-other",
  userId: "u-other",
  employeeName: "Co-Worker Ramesh",
};

// A credit-customer row carrying a balance it should never have. The
// directory an attendant picks credit customers from is balance-free; if a
// balance ever reached the browser anyway, no screen may print it.
const DIRECTORY_CUSTOMER = {
  id: "c1",
  name: "Kumar Transports",
  phone: "9000000000",
  balance: "777777",
};

const PUMPS = [{ id: "p1", name: "Pump 1" }];
const NOZZLES = [
  { id: "n1", pumpId: "p1", name: "N1", fuelType: "MS", lastReading: "1000" },
  { id: "n2", pumpId: "p1", name: "N2", fuelType: "HSD", lastReading: "2000" },
];

/** No screen may print any of these. */
const FORBIDDEN = ["Co-Worker Ramesh", "777,777.00", "777777", "u-other"];

// pattern = the real route (so useParams matches), path = where we enter.
const SCREENS = [
  { name: "Today home", pattern: "/today", path: "/today", element: <TodayHome /> },
  {
    name: "running shift",
    pattern: "/today/shift/:id",
    path: "/today/shift/sh-open",
    element: <ShiftRun />,
  },
  {
    name: "history",
    pattern: "/today/history",
    path: "/today/history",
    element: <TodayHistory />,
  },
  {
    name: "shift detail",
    pattern: "/today/history/:id",
    path: "/today/history/sh-back",
    element: <ShiftDetail />,
  },
  {
    name: "close shift",
    pattern: "/today/shift/:id/close",
    path: "/today/shift/sh-open/close",
    element: <CloseShift />,
  },
  {
    name: "account",
    pattern: "/today/account",
    path: "/today/account",
    element: <TodayAccount />,
  },
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

async function mountAt(pattern, path, element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <LanguageProvider>
            <Routes>
              <Route path={pattern} element={element} />
              <Route path="/today" element={<div />} />
              <Route path="/today/shift/:id" element={<div />} />
              <Route path="/today/shift/:id/close" element={<div />} />
              <Route path="/today/history/:id" element={<div />} />
              <Route path="/today/history/:id/edit" element={<div />} />
            </Routes>
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  });
  await settle();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.listShifts.mockResolvedValue([
    CO_WORKER_SHIFT,
    MY_REJECTED_SHIFT,
    MY_SETTLED_SHIFT,
    MY_OPEN_SHIFT,
  ]);
  api.listPumps.mockResolvedValue({ pumps: PUMPS, nozzles: NOZZLES });
  api.listNozzleOccupancy.mockResolvedValue(["n2"]);
  api.listCustomerDirectory.mockResolvedValue([DIRECTORY_CUSTOMER]);
  api.listCustomers.mockResolvedValue([DIRECTORY_CUSTOMER]);
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

describe("attendant screens stay private", () => {
  it.each(SCREENS.map((screen) => [screen.name, screen]))(
    "%s renders none of the forbidden values",
    async (name, screen) => {
      await mountAt(screen.pattern, screen.path, screen.element);
      for (const secret of FORBIDDEN) {
        expect(container.textContent, `${name} leaked "${secret}"`).not.toContain(secret);
      }
    }
  );

  it("still shows the attendant their own data: readings, and the credit customers they pick", async () => {
    await mountAt("/today/shift/:id/close", "/today/shift/sh-open/close", <CloseShift />);
    // Own opening meters are fine.
    expect(container.textContent).toContain("1,000.00");

    // The credit-customer list is deliberately balance-free: names and
    // phones only. The name is allowed; the balance never renders.
    const add = [...container.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Add credit sale")
    );
    await act(async () => {
      add.click();
    });
    await settle();
    expect(container.textContent).toContain("Kumar Transports");
    for (const secret of FORBIDDEN) {
      expect(container.textContent).not.toContain(secret);
    }
  });

  it("keeps the busy-nozzle hint anonymous on the picker", async () => {
    // No open shift of their own, or the picker happily redirects to it.
    api.listShifts.mockResolvedValue([CO_WORKER_SHIFT, MY_SETTLED_SHIFT]);
    await mountAt("/today/start", "/today/start", <StartShift />);
    const busyTile = [...container.querySelectorAll(".nozzle-row")].find((tile) =>
      tile.textContent.includes("N2")
    );
    expect(busyTile.disabled).toBe(true);
    expect(busyTile.textContent).toContain("Another operator");
    expect(busyTile.textContent).not.toContain("Ramesh");
  });
});
