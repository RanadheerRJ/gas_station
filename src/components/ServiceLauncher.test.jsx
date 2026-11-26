// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import ServiceLauncher from "./ServiceLauncher.jsx";
import { destinationsFor } from "./Layout.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import { todayISO } from "../lib/format.js";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listCustomers: vi.fn(),
}));
const auth = vi.hoisted(() => ({ profile: null }));

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  listShifts: api.listShifts,
  listCustomers: api.listCustomers,
}));
vi.mock("../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const homePaths = { owner: "/owner", manager: "/station", attendant: "/today" };
const startPaths = {
  owner: "/owner/shifts/start",
  manager: "/station/start",
  attendant: "/today/start",
};

function shift({
  id,
  uid = "u-manager",
  status = "approved",
  date = todayISO(),
  litres = 10,
  price = 100,
  employeeName = "Ravi",
  expenses = [],
}) {
  return {
    id,
    userId: uid,
    employeeName,
    status,
    date,
    startTime: `${date}T08:00:00.000Z`,
    nozzles: [{ openingReading: 100, closingReading: 100 + litres, price }],
    expenses,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let container;
let root;
let props;

async function renderLauncher(role, overrides = {}) {
  auth.profile = { uid: `u-${role}`, role, name: "Ravi", username: "ravi" };
  props = {
    ...destinationsFor(role),
    startPath: startPaths[role],
    homePath: homePaths[role],
    onOpenHome: vi.fn(),
    station: { id: "s2", name: "Hillview" },
    stationsLoading: false,
    stationsError: "",
    reloadStations: vi.fn(),
    stationTarget: (to) => ({ pathname: to, search: "?station=s2" }),
    canSwitchStation: true,
    onOpenStation: vi.fn(),
    ...overrides,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await renderAgain();
}

async function renderAgain(overrides = {}) {
  props = { ...props, ...overrides };
  await act(async () => {
    root.render(
      <MemoryRouter>
        <LanguageProvider initialLanguage="en">
          <ServiceLauncher {...props} />
        </LanguageProvider>
      </MemoryRouter>
    );
  });
}

async function click(element) {
  expect(element).toBeTruthy();
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  );
}

function stat(label) {
  return [...container.querySelectorAll(".stat")]
    .find((item) => item.querySelector(".k")?.textContent === label)
    ?.querySelector(".v")?.textContent;
}

beforeEach(() => {
  window.localStorage.clear();
  api.listShifts.mockReset().mockResolvedValue([]);
  api.listCustomers.mockReset().mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  auth.profile = null;
});

describe("service launcher figures", () => {
  it("uses only the selected station's completed sales, credit and review count, masking owner money until requested", async () => {
    api.listShifts.mockResolvedValue([
      shift({ id: "a", uid: "u-owner" }),
      shift({ id: "b", uid: "u-owner", status: "pending_review", litres: 20, price: 90 }),
      shift({ id: "old", status: "pending_review", date: "2000-01-01", litres: 99 }),
      shift({ id: "open", status: "open", litres: 500 }),
    ]);
    api.listCustomers.mockResolvedValue([
      { outstandingBalance: "1400" },
      { outstandingBalance: 350.5 },
    ]);
    await renderLauncher("owner");

    expect(api.listShifts).toHaveBeenCalledTimes(1);
    expect(api.listShifts).toHaveBeenCalledWith("s2");
    expect(api.listCustomers).toHaveBeenCalledTimes(1);
    expect(api.listCustomers).toHaveBeenCalledWith("s2");
    expect(container.querySelector(".buddy-id__name").textContent).toBe("Hillview");
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe("₹ ••••");
    expect(container.querySelector(".buddy-balance__row").textContent).toContain(
      "₹ ••••"
    );
    expect(stat("Today’s sales")).toBe("₹ ••••");
    expect(stat("Outstanding credit")).toBe("₹ ••••");
    expect(stat("Fuel dispensed")).toBe("30.00 L");
    expect(stat("Pending review")).toBe("2");
    expect(
      container.querySelector('.quick-stat-row[role="region"]').getAttribute("tabindex")
    ).toBe("0");
    expect(container.textContent).not.toContain("2,800.00");
    expect(container.textContent).not.toContain("1,750.50");

    await click(container.querySelector('[aria-label="Show amount"]'));
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 2,800.00"
    );
    expect(stat("Today’s sales")).toBe("₹ 2,800.00");
    expect(stat("Outstanding credit")).toBe("₹ 1,750.50");
    expect(container.querySelector(".buddy-balance__row").getAttribute("href")).toBe(
      "/owner/shifts?station=s2"
    );
    await click(container.querySelector('[aria-label="Hide amount"]'));
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe("₹ ••••");
  });

  it("shows a manager's completed shifts as links to their existing details", async () => {
    api.listShifts.mockResolvedValue([
      shift({ id: "m1", employeeName: "Ravi" }),
      shift({ id: "m2", employeeName: "Meera", litres: 5, price: 80 }),
      shift({ id: "m-open", status: "open", litres: 200 }),
    ]);
    await renderLauncher("manager");
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 1,400.00"
    );
    expect(container.querySelector(".buddy-balance__pill").textContent).toContain(
      "2 shifts"
    );
    const rows = [...container.querySelectorAll(".buddy-balance__row")];
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/station/shift/m1?station=s2",
      "/station/shift/m2?station=s2",
    ]);
    expect(rows[0].textContent).toContain("Ravi");
    expect(rows[1].textContent).toContain("Meera");
    await click(container.querySelector(".buddy-balance__pill"));
    expect(
      container.querySelector(".buddy-balance__pill").getAttribute("aria-expanded")
    ).toBe("false");
    expect(container.querySelector(".buddy-balance__rows")).toBeNull();
  });

  it("never fetches customer balances for attendants or includes another person's shifts and live sales", async () => {
    const alternateId = shift({ id: "mine-alt", uid: undefined, litres: 2, price: 50 });
    delete alternateId.userId;
    alternateId.employeeId = "u-attendant";
    api.listShifts.mockResolvedValue([
      shift({ id: "mine", uid: "u-attendant" }),
      alternateId,
      shift({
        id: "my-live",
        uid: "u-attendant",
        status: "open",
        litres: 400,
        expenses: [{ amount: 40 }],
      }),
      shift({
        id: "other",
        uid: "u-other",
        litres: 200,
        employeeName: "Private coworker",
      }),
      shift({
        id: "other-live",
        uid: "u-other",
        status: "open",
        expenses: [{ amount: 999 }],
      }),
    ]);
    await renderLauncher("attendant", { canSwitchStation: false });
    expect(api.listShifts).toHaveBeenCalledWith("s2");
    expect(api.listCustomers).not.toHaveBeenCalled();
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 1,100.00"
    );
    expect(stat("Fuel dispensed")).toBe("12.00 L");
    expect(stat("Expenses so far")).toBe("₹ 40.00");
    expect(container.textContent).not.toContain("Private coworker");
    expect(container.textContent).not.toContain("20,000.00");
    expect(container.textContent).not.toContain("Outstanding credit");
    expect(
      [...container.querySelectorAll(".buddy-balance__row")].map((row) =>
        row.getAttribute("href")
      )
    ).toEqual(["/today/history/mine?station=s2", "/today/history/mine-alt?station=s2"]);
  });
});

describe("service launcher loading and recovery", () => {
  it("shows loading rather than zero or stale data and ignores late responses from an old station", async () => {
    const s2 = deferred();
    const s3 = deferred();
    api.listShifts.mockImplementation((id) => {
      if (id === "s1") return Promise.resolve([shift({ id: "first" })]);
      return id === "s2" ? s2.promise : s3.promise;
    });
    await renderLauncher("manager", { station: { id: "s1", name: "First" } });
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 1,000.00"
    );

    await renderAgain({ station: { id: "s2", name: "Second" } });
    expect(container.querySelector(".buddy-balance__amount")).toBeNull();
    expect(container.querySelector(".buddy-balance__amount-skeleton")).toBeTruthy();
    expect(container.textContent).not.toContain("1,000.00");
    expect(container.textContent).not.toContain("0.00");

    await renderAgain({ station: { id: "s3", name: "Third" } });
    await act(async () => s3.resolve([shift({ id: "third", litres: 3 })]));
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 300.00"
    );
    await act(async () => s2.resolve([shift({ id: "second", litres: 20 })]));
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 300.00"
    );
    expect(container.textContent).not.toContain("2,000.00");
  });

  it("offers retry after a figure request fails and replaces the unavailable state on success", async () => {
    api.listShifts.mockResolvedValue([shift({ id: "shift" })]);
    api.listCustomers.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    await renderLauncher("manager");
    expect(container.querySelector('[role="alert"]').textContent).toContain(
      "Couldn’t load"
    );
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe("—");
    expect(container.textContent).toContain("Figures are unavailable right now.");
    expect(container.textContent).not.toContain("₹ 0.00");
    await click(container.querySelector(".notice__action"));
    expect(api.listShifts).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe(
      "₹ 1,000.00"
    );
  });

  it("distinguishes station-list failure, retrying and an empty station list", async () => {
    const reloadStations = vi.fn();
    await renderLauncher("owner", { stationsError: "offline", reloadStations });
    expect(api.listShifts).not.toHaveBeenCalled();
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe("—");
    expect(container.textContent).toContain("Figures are unavailable right now.");
    await click(container.querySelector(".notice__action"));
    expect(reloadStations).toHaveBeenCalledTimes(1);

    await renderAgain({ stationsLoading: true });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(".buddy-balance__amount-skeleton")).toBeTruthy();
    await renderAgain({ stationsLoading: false, stationsError: "", station: undefined });
    expect(container.textContent).toContain("No station available yet.");
    expect(container.querySelector(".buddy-balance__amount").textContent).toBe("—");
    expect(api.listShifts).not.toHaveBeenCalled();
  });
});
