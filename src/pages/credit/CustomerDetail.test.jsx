// @vitest-environment jsdom
/**
 * The customer statement screen, pinned where it was reported broken.
 *
 * On a phone the two money buttons used to live under a fully expanded
 * transaction history, so reaching them meant scrolling past the whole
 * account. These tests assert the opposite: the actions come before the
 * statement in document order, the statement is collapsed to the most recent
 * entries behind a "View full statement" button, and the ledger reads as a
 * bank statement (opening balance, day headers, running balance, totals).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import { ThemeProvider } from "../../state/ThemeContext";
import CustomerDetail from "./CustomerDetail.jsx";

const TODAY = new Date();
const iso = (date) => date.toISOString().slice(0, 10);
const thisMonth = (day) => `${iso(TODAY).slice(0, 7)}-${String(day).padStart(2, "0")}`;

/** 14 entries this month, so the collapsed view has something to hide. */
const transactions = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i}`,
  date: thisMonth(Math.min(TODAY.getDate(), i + 1)),
  type: i % 3 === 0 ? "payment" : "credit",
  amount: 100 * (i + 1),
  note: "",
  recordedAt: `${thisMonth(Math.min(TODAY.getDate(), i + 1))}T08:0${i % 10}:00Z`,
  recordedByName: "Mia Manager",
}));

const CUSTOMER = {
  id: "c1",
  name: "Blue Haul Logistics",
  phone: "9000000001",
  outstandingBalance: 4200,
  transactions,
};

const api = vi.hoisted(() => ({
  listCustomers: vi.fn(async () => [CUSTOMER]),
  listCustomerTransactions: vi.fn(async () => []),
  updateCustomer: vi.fn(async () => ({ ok: true })),
  updateCustomerCredit: vi.fn(async () => ({ ok: true })),
  voidCustomerCredit: vi.fn(async () => ({ ok: true })),
  addCustomerTransaction: vi.fn(async () => ({ ok: true })),
  archiveCustomer: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../lib/api", () => ({
  ...api,
  readableError: (e) => String(e?.message || e),
}));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: { uid: "u1", role: "owner", name: "Owner" } }),
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
  // The screen tags the shell's scrolling column while it is mounted.
  const main = document.createElement("div");
  main.className = "main";
  document.body.append(main, container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={["/owner/credit/c1"]}>
        <ThemeProvider>
          <LanguageProvider>
            <Routes>
              <Route path="/owner/credit/:customerId" element={<CustomerDetail />} />
            </Routes>
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  });
  return main;
}

const text = (node) => node?.textContent || "";
const buttonWith = (label) =>
  [...document.querySelectorAll("button")].find((b) => text(b).includes(label));

/** Set an input the way React notices: native setter, then an input event. */
const setInput = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
});

describe("customer detail", () => {
  it("puts both actions inside the balance card, above the statement", async () => {
    await render();
    const card = container.querySelector(".balance-card");
    expect(text(card)).toContain("Outstanding balance");
    const actions = card.querySelector(".balance-card__actions");
    expect([...actions.children].map(text)).toEqual(["Receive payment", "Give credit"]);
    const statement = container.querySelector(".statement");
    expect(
      card.compareDocumentPosition(statement) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("keeps the actions out of any action bar lower down the page", () => {
    expect(container?.querySelector(".action-bar")).toBeFalsy();
  });

  it("collapses the ledger to the ten most recent entries", async () => {
    await render();
    expect(container.querySelectorAll(".st-row").length).toBe(10);
    expect(buttonWith("View full statement")).toBeTruthy();
  });

  it("opens a full-screen statement with every entry and a way back", async () => {
    await render();
    await act(async () => buttonWith("View full statement").click());
    const full = document.querySelector(".statement-full");
    expect(full).toBeTruthy();
    expect(full.querySelectorAll(".st-row").length).toBe(transactions.length);
    const back = full.querySelector(".back-link");
    await act(async () => back.click());
    expect(document.querySelector(".statement-full")).toBeFalsy();
  });

  it("reads as a bank statement: opening, day headers, running balance, totals", async () => {
    await render();
    const scroll = container.querySelector(".statement__scroll");
    expect(text(scroll.querySelector(".st-balance--opening"))).toContain(
      "Opening balance"
    );
    expect(scroll.querySelectorAll(".st-group__day").length).toBeGreaterThan(0);
    expect(text(scroll.querySelector(".st-row__bal"))).toMatch(/^Bal ₹/);
    expect(text(scroll.querySelector(".st-balance--closing"))).toContain(
      "Closing balance"
    );
    const totals = text(scroll.querySelector(".st-totals"));
    expect(totals).toContain("Total credit given");
    expect(totals).toContain("Total payments received");
    expect(totals).toContain("Net");
  });

  it("filters to payments only, and says so when a period is empty", async () => {
    await render();
    await act(async () => buttonWith("Payments").click());
    const amounts = [...container.querySelectorAll(".st-row__amt")];
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.every((a) => a.className.includes("is-credit"))).toBe(true);

    await act(async () => buttonWith("Last month").click());
    expect(text(container.querySelector(".statement__empty"))).toContain(
      "No transactions in this period"
    );
  });

  it("hands the shell's height to the screen while it is mounted", async () => {
    const main = await render();
    expect(main.classList.contains("main--fixed")).toBe(true);
    await act(async () => root.unmount());
    root = null;
    expect(main.classList.contains("main--fixed")).toBe(false);
  });

  it("edits the customer's name and phone in place, behind the more menu", async () => {
    await render();
    await act(async () => container.querySelector("button.icon-btn").click());
    await act(async () => buttonWith("Edit customer details").click());
    const dialog = document.querySelector(".sheet, [role='dialog']");
    expect(dialog).toBeTruthy();
    const [nameInput, phoneInput] = dialog.querySelectorAll("input");
    expect(nameInput.value).toBe("Blue Haul Logistics");
    expect(phoneInput.value).toBe("9000000001");

    // A no-op save is refused on screen before the database ever sees it.
    const save = [...dialog.querySelectorAll("button")].find((b) =>
      text(b).includes("Save changes")
    );
    expect(save.disabled).toBe(true);

    await act(async () => {
      setInput(nameInput, "Blue Haul Logistics Pvt Ltd");
      setInput(phoneInput, "9000000099");
    });
    expect(save.disabled).toBe(false);
    await act(async () => {
      dialog
        .querySelector("form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.updateCustomer).toHaveBeenCalledWith("c1", {
      name: "Blue Haul Logistics Pvt Ltd",
      phone: "9000000099",
    });
    expect(text(container)).toContain("Customer details updated.");
  });
});
