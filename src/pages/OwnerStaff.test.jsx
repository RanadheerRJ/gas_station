// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import OwnerStaff from "./OwnerStaff.jsx";
import * as api from "../lib/api.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockProfile = { uid: "owner-1", role: "owner", name: "Ramesh Kumar" };
const mockStations = [
  { id: "st-1", name: "Highway 44 Fuel" },
  { id: "st-2", name: "City Centre Pump" },
];

vi.mock("../state/AuthContext", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

vi.mock("../state/useStations", () => ({
  useStations: () => ({ stations: mockStations, loading: false }),
}));

let container = null;
let root = null;

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function renderComponent() {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <OwnerStaff />
      </LanguageProvider>
    );
  });
}

function changeInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const mockStaffList = [
  {
    uid: "staff-1",
    name: "Suresh Babu",
    username: "suresh1",
    phone: "+91 98765 43210",
    role: "attendant",
    stationIds: ["st-1"],
    createdAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  vi.spyOn(api, "listStaff").mockResolvedValue(mockStaffList);
  vi.spyOn(api, "createStaff").mockResolvedValue({
    username: "suresh2",
    pin: "7391",
    subject: "Suresh Babu",
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  document.body.querySelectorAll(".sheet-root").forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("OwnerStaff page interactions and Sheet reliability", () => {
  it("renders staff list and Create Login button", async () => {
    renderComponent();
    await settle();

    expect(container.textContent).toContain("Staff & access");
    const createBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent.includes("Create login")
    );
    expect(createBtn).toBeTruthy();
    expect(container.textContent).toContain("Suresh Babu");
  });

  it("clicking Create login opens the Create Staff Login Sheet in document.body", async () => {
    renderComponent();
    await settle();

    expect(document.body.querySelector(".sheet-root")).toBeNull();

    const createBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent.includes("Create login")
    );
    await click(createBtn);

    const sheetRoot = document.body.querySelector(".sheet-root");
    expect(sheetRoot).toBeTruthy();
    expect(sheetRoot.parentElement).toBe(document.body);

    const title = sheetRoot.querySelector(".sheet__head h2");
    expect(title?.textContent).toBeTruthy();

    // All form fields are present
    const inputs = sheetRoot.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(4); // name, phone, pin, confirmPin
    const selects = sheetRoot.querySelectorAll("select");
    expect(selects.length).toBe(2); // station, role
  });

  it("validates form, submits createStaff and displays generated credentials", async () => {
    renderComponent();
    await settle();

    const createBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent.includes("Create login")
    );
    await click(createBtn);

    const sheetRoot = document.body.querySelector(".sheet-root");
    const nameInput = sheetRoot.querySelector('input[placeholder="Suresh Babu"]');
    const phoneInput = sheetRoot.querySelector(
      'input[type="tel"], input[inputmode="tel"]'
    );
    const pinInputs = sheetRoot.querySelectorAll('input[type="password"]');
    const submitBtn = sheetRoot.querySelector('button[type="submit"].cta');

    expect(submitBtn.disabled).toBe(true);

    // Fill form with valid unguessable PIN
    act(() => {
      changeInput(nameInput, "Mahesh Kumar");
      changeInput(phoneInput, "+91 98765 11223");
      changeInput(pinInputs[0], "7391");
      changeInput(pinInputs[1], "7391");
    });

    await settle();
    expect(submitBtn.disabled).toBe(false);

    // Submit form
    const form = sheetRoot.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();

    expect(api.createStaff).toHaveBeenCalledWith({
      name: "Mahesh Kumar",
      phone: "+91 98765 11223",
      stationId: "st-1",
      role: "attendant",
      pin: "7391",
    });

    // CredentialPanel is displayed after successful account creation
    expect(document.body.textContent).toContain("suresh2");
  });

  it("clicking Reset PIN opens the Reset PIN Sheet", async () => {
    renderComponent();
    await settle();

    const resetBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent.toLowerCase().includes("reset pin")
    );
    expect(resetBtn).toBeTruthy();
    await click(resetBtn);

    const sheetRoot = document.body.querySelector(".sheet-root");
    expect(sheetRoot).toBeTruthy();
    expect(sheetRoot.textContent).toContain("Suresh Babu");
    expect(sheetRoot.querySelector('input[type="password"]')).toBeTruthy();
  });
});
