// @vitest-environment jsdom
/**
 * Owner corrections on the customer ledger.
 *
 * Money is never removed by deleting a row: the owner voids with a reason and
 * the entry stays on the page, struck through, with who voided it and why. A
 * voided entry is also kept out of the running balance — the API hands the
 * screen the active history and the voided rows separately, and these pin
 * that the screen honours the split.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import { ThemeProvider } from "../../state/ThemeContext";
import CustomerDetail from "./CustomerDetail.jsx";

const TODAY = new Date().toISOString().slice(0, 10);

const CUSTOMER = {
  id: "c1",
  name: "Ramesh Kumar",
  phone: "9988000001",
  outstandingBalance: 500,
  transactions: [
    {
      id: "t1",
      date: TODAY,
      type: "credit",
      amount: 500,
      note: "Diesel",
      recordedAt: `${TODAY}T10:42:00Z`,
      recordedByName: "Ravi",
      status: "active",
    },
  ],
  voidedTransactions: [
    {
      id: "t0",
      date: TODAY,
      type: "credit",
      amount: 5000,
      recordedAt: `${TODAY}T09:10:00Z`,
      status: "voided",
      voidReason: "Duplicate entry",
      voidedByName: "Olive Owner",
    },
  ],
};

const api = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  listCustomerTransactions: vi.fn(),
  addCustomerTransaction: vi.fn(async () => ({ ok: true })),
  archiveCustomer: vi.fn(async () => ({ ok: true })),
  updateCustomer: vi.fn(async () => ({ ok: true })),
  updateCustomerCredit: vi.fn(async () => ({ ok: true })),
  voidCustomerCredit: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../lib/api", () => ({
  ...api,
  readableError: (error) => String(error?.message || error),
}));

const auth = vi.hoisted(() => ({ role: "owner" }));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: { uid: "u1", role: auth.role, name: "Olive" } }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    stations: [{ id: "s1", name: "City Ctr" }],
    station: { id: "s1", name: "City Ctr" },
    stationId: "s1",
    setStation: () => {},
    link: (to) => ({ pathname: to, search: "" }),
    loading: false,
    reload: () => {},
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

async function render() {
  container = document.createElement("div");
  const main = document.createElement("div");
  main.className = "main";
  document.body.append(main, container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ThemeProvider>
        <LanguageProvider>
          <MemoryRouter initialEntries={["/owner/credit/c1"]}>
            <Routes>
              <Route path="/owner/credit/:customerId" element={<CustomerDetail />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    );
  });
}

const sheet = () => document.querySelector(".sheet, [role='dialog']") || document.body;
const click = async (element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

beforeEach(() => {
  auth.role = "owner";
  api.listCustomers.mockResolvedValue([CUSTOMER]);
  api.listCustomerTransactions.mockResolvedValue([
    {
      id: "t1",
      customerId: "c1",
      shiftId: "sh-1",
      shiftLabel: "Ravi · 05 Oct",
      status: "active",
      editCount: 1,
      recordedByName: "Ravi",
    },
  ]);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("owner corrections on the customer ledger", () => {
  it("shows the shift behind an entry and marks a corrected one", async () => {
    await render();
    const row = container.querySelector(".st-row");
    expect(row.textContent).toContain("Ravi · 05 Oct");
    expect(row.textContent).toContain("Corrected");
  });

  it("keeps a voided entry visible with its reason, out of the balance", async () => {
    await render();
    const voided = container.querySelector(".st-row--voided");
    expect(voided.textContent).toContain("Duplicate entry");
    expect(voided.textContent).toContain("Olive Owner");
    // 500 is the balance of the one active entry: the voided 5,000 is gone
    // from the running total but not from the page.
    expect(container.querySelector(".balance-card__value").textContent).toContain("500");
  });

  it("voids through the RPC with the chosen reason", async () => {
    await render();
    const row = container.querySelector(".st-row");
    await click([...row.querySelectorAll("button")].at(-1));
    await click(
      [...sheet().querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Wrong customer"
      )
    );
    await act(async () => {
      sheet()
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.voidCustomerCredit).toHaveBeenCalledWith("t1", "Wrong customer", "");
  });

  it("offers no correction controls to a manager", async () => {
    auth.role = "manager";
    await render();
    const row = container.querySelector(".st-row");
    expect(row.querySelector(".st-row__actions")).toBeNull();
  });
});
