// @vitest-environment jsdom
/**
 * Credit on the running shift, from the attendant's side.
 *
 * The screen-level contract these pin down: an attendant records credit
 * against a customer they can search (or create), sees their own entries and
 * nothing financial about the account, can correct an entry the database
 * still lets them touch, and is shown a lock — not an Edit button — once the
 * shift has been approved. The permission itself lives in SQL; this is the
 * surface that must agree with it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import ShiftCreditCard from "./ShiftCreditCard.jsx";

const api = vi.hoisted(() => ({
  listShiftCredit: vi.fn(),
  listCustomerDirectory: vi.fn(),
  addShiftCredit: vi.fn(async () => ({ ok: true })),
  createCustomer: vi.fn(async () => ({ id: "c-new" })),
  updateCustomerCredit: vi.fn(async () => ({ ok: true })),
  voidCustomerCredit: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../lib/api", () => ({
  ...api,
  readableError: (error) => String(error?.message || error),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ENTRIES = [
  {
    id: "t1",
    customerId: "c1",
    customerName: "Ramesh Kumar",
    customerPhone: "9988000001",
    amount: 5000,
    note: "Diesel",
    status: "active",
    editCount: 0,
    recordedBy: "u-att",
    recordedByName: "Ravi",
    recordedAt: "2026-10-05T10:42:00Z",
    canEdit: true,
  },
  {
    id: "t2",
    customerId: "c2",
    customerName: "Lakshmi Traders",
    customerPhone: "9988000002",
    amount: 2500,
    note: "Petrol",
    status: "active",
    editCount: 1,
    recordedBy: "u-att",
    recordedByName: "Ravi",
    recordedAt: "2026-10-05T11:18:00Z",
    canEdit: false, // the shift behind it is approved
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
        <ShiftCreditCard stationId="s1" shiftId="sh-1" />
      </LanguageProvider>
    );
  });
}

// The sheets render through a portal onto document.body, so queries for
// anything inside one have to look at the whole document.
const text = () => container.textContent;
const sheet = () => document.querySelector(".sheet, [role='dialog']") || document.body;
const buttons = () => [...document.querySelectorAll("button")];
const byText = (label) =>
  buttons().find((button) => button.textContent.trim().toLowerCase().includes(label));
const click = async (element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const type = async (input, value) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  api.listShiftCredit.mockResolvedValue(ENTRIES);
  api.listCustomerDirectory.mockResolvedValue([
    { id: "c1", name: "Ramesh Kumar", phone: "9988000001" },
  ]);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("attendant credit on a running shift", () => {
  it("lists the operator's own entries and never a customer balance", async () => {
    await render();
    expect(text()).toContain("Ramesh Kumar");
    expect(text()).toContain("Lakshmi Traders");
    expect(text()).not.toMatch(/outstanding/i);
    expect(text()).not.toMatch(/balance/i);
  });

  it("shows a lock instead of Edit once the shift is approved", async () => {
    await render();
    const rows = [...container.querySelectorAll(".ledger-row")];
    expect(rows[0].textContent).toMatch(/edit/i);
    expect(rows[1].textContent).not.toMatch(/edit/i);
    expect(rows[1].textContent).toContain("🔒");
  });

  it("records credit against a customer picked from the directory", async () => {
    await render();
    await click(byText("add credit"));
    await click(buttons().find((button) => button.textContent.includes("Ramesh Kumar")));
    await type(sheet().querySelector(".amount-field input"), "2500");
    await act(async () => {
      sheet()
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.createCustomer).not.toHaveBeenCalled();
    expect(api.addShiftCredit).toHaveBeenCalledWith("s1", "sh-1", {
      customerId: "c1",
      amount: 2500,
      note: "",
    });
  });

  it("creates a customer from the credit flow, then credits it", async () => {
    await render();
    await click(byText("add credit"));
    await click(byText("new customer"));
    const [name, phone] = sheet().querySelectorAll(".field input");
    await type(name, "New Haulage");
    await type(phone, "9700000000");
    await type(sheet().querySelector(".amount-field input"), "900");
    await act(async () => {
      sheet()
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.createCustomer).toHaveBeenCalledWith("s1", {
      name: "New Haulage",
      phone: "9700000000",
    });
    expect(api.addShiftCredit).toHaveBeenCalledWith(
      "s1",
      "sh-1",
      expect.objectContaining({ customerId: "c-new", amount: 900 })
    );
  });

  it("reuses the existing account when the typed phone matches the directory", async () => {
    await render();
    await click(byText("add credit"));
    await click(byText("new customer"));
    const [name, phone] = sheet().querySelectorAll(".field input");
    await type(name, "Ramesh Kumar");
    // Same digits as the directory entry, typed with spaces — the duplicate
    // the database used to insert as a second customer.
    await type(phone, "9988 000 001");
    expect(sheet().textContent).toMatch(/already exists/i);
    await click(byText("use ramesh kumar"));
    await type(sheet().querySelector(".amount-field input"), "400");
    await act(async () => {
      sheet()
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.createCustomer).not.toHaveBeenCalled();
    expect(api.addShiftCredit).toHaveBeenCalledWith("s1", "sh-1", {
      customerId: "c1",
      amount: 400,
      note: "",
    });
  });

  it("sends the corrected amount and a reason, never a balance", async () => {
    await render();
    await click(
      [...container.querySelectorAll(".ledger-row")][0].querySelector("button")
    );
    await type(sheet().querySelector(".amount-field input"), "500");
    await type(sheet().querySelector(".field input"), "Wrong amount");
    await act(async () => {
      sheet()
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.updateCustomerCredit).toHaveBeenCalledWith("t1", 500, "Wrong amount");
  });

  it("will not void without a reason, and passes the chosen one through", async () => {
    await render();
    const row = [...container.querySelectorAll(".ledger-row")][0];
    await click([...row.querySelectorAll("button")][1]);
    const confirm = buttons().find((b) => b.classList.contains("cta"));
    expect(confirm.disabled).toBe(true);
    await click(byText("duplicate entry"));
    await act(async () => {
      sheet()
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.voidCustomerCredit).toHaveBeenCalledWith("t1", "Duplicate entry", "");
  });
});
