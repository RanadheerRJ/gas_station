// @vitest-environment jsdom
/**
 * The money path, end to end, through the real close-shift screen.
 *
 * This screen is where readings, expenses, credit and the cash count turn
 * into a single close_shift call, and the only proof that a refactor of it
 * changed nothing is an assertion on the exact arguments that reach the RPC.
 * So: drive the real component the way a person does — type a closing
 * reading, edit an expense, record a credit sale, count the cash, submit —
 * and pin the payload, the redirect and the cleared drafts.
 *
 * Written before the component was split into a hook plus sections, and left
 * byte-identical afterwards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import CloseShift from "./CloseShift.jsx";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listCustomerDirectory: vi.fn(),
  closeShift: vi.fn(),
  resubmitRejectedShift: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  listShifts: api.listShifts,
  listCustomerDirectory: api.listCustomerDirectory,
  closeShift: api.closeShift,
  resubmitRejectedShift: api.resubmitRejectedShift,
  readableError: (error) => String(error?.message || error),
}));

const auth = vi.hoisted(() => ({
  profile: { uid: "u-att", role: "attendant", name: "Ravi" },
}));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({ stationId: "s1", loading: false }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OPEN_SHIFT = {
  id: "sh-1",
  status: "open",
  userId: "u-att",
  employeeName: "Ravi",
  startTime: "2026-09-19T06:00:00.000Z",
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
  creditSales: [],
  payments: {},
  testing: {},
};

const REJECTED_SHIFT = {
  ...OPEN_SHIFT,
  id: "sh-2",
  status: "rejected",
  rejectedByName: "Owner",
  rejectionReason: "Nozzle 2 reading looks wrong",
  nozzles: OPEN_SHIFT.nozzles.map((n, index) => ({
    ...n,
    closingReading: index === 0 ? "1500" : "2500",
  })),
  expenses: [
    { label: "Tea", amount: "40" },
    { label: "Air pump repair", amount: "150" },
  ],
  payments: { cash: "1000", card: "", upi: "", credit: "", other: "" },
  testing: { MS: "50", HSD: "" },
};

let container = null;
let root = null;

/** Mount the screen at the close route for `shiftId`, and let it settle. */
async function mountClose(shiftId) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[`/today/shift/${shiftId}/close`]}>
        <LanguageProvider>
          <Routes>
            <Route path="/today/shift/:id/close" element={<CloseShift />} />
            <Route path="/today" element={<div data-testid="today-home" />} />
            <Route path="/today/history/:id" element={<div data-testid="detail" />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    );
  });
  await settle();
}

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Fire a React-visible change on a controlled input. */
async function type(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function readingInput(label) {
  return [...container.querySelectorAll("input")].find((input) =>
    (input.getAttribute("aria-label") || "").startsWith(label)
  );
}

function buttonByText(text) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === text
  );
}

beforeEach(() => {
  window.localStorage.clear();
  auth.profile = { uid: "u-att", role: "attendant", name: "Ravi" };
  api.listShifts.mockResolvedValue([OPEN_SHIFT, REJECTED_SHIFT]);
  api.listCustomerDirectory.mockResolvedValue([
    { id: "c1", name: "Kumar Transports", phone: "9000000000" },
  ]);
  api.closeShift.mockResolvedValue({ ok: true });
  api.resubmitRejectedShift.mockResolvedValue({ ok: true });
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
});

describe("closing a shift", () => {
  it("loads the shift and its customer directory for the active station", async () => {
    await mountClose("sh-1");
    expect(api.listShifts).toHaveBeenCalledWith("s1");
    expect(api.listCustomerDirectory).toHaveBeenCalledWith("s1");
    expect(container.querySelector(".screen-head h1").textContent).toContain("Ravi");
    // The expense logged while the shift was open is shown, read-only.
    expect(container.textContent).toContain("Tea");
  });

  it("refuses to submit a reading below the opening and names the nozzle", async () => {
    await mountClose("sh-1");
    await type(readingInput("P1 · N1"), "900");
    await type(readingInput("P1 · N2"), "2100");
    await click(buttonByText("Close shift & send for review"));

    expect(api.closeShift).not.toHaveBeenCalled();
    const problems = container.querySelector("ul");
    expect(problems.textContent).toContain("P1 · N1");
    expect(problems.textContent).toContain("below opening");
  });

  it("sends the readings, expenses, credit and cash count in one payload", async () => {
    await mountClose("sh-1");
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");

    // Fuel tested and returned to the tank.
    const testingInputs = [...container.querySelectorAll(".form-grid input")];
    await type(testingInputs[0], "200");

    // One credit sale against a known customer.
    await click(buttonByText("Add credit sale"));
    const select = container.querySelector(".credit-row select");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value"
      ).set;
      setter.call(select, "c1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const amount = [...container.querySelectorAll(".credit-row input")].at(-1);
    await type(amount, "500");

    // The cash count. Credit is mirrored from the sale above and read-only.
    const cashInputs = [...container.querySelectorAll(".card .form-grid input")];
    const cash = cashInputs.find((input) => input.readOnly === false && input !== amount);
    await type(cash, "9000");

    await click(buttonByText("Close shift & send for review"));
    await settle();

    expect(api.closeShift).toHaveBeenCalledTimes(1);
    const [stationId, shiftId, payload] = api.closeShift.mock.calls[0];
    expect(stationId).toBe("s1");
    expect(shiftId).toBe("sh-1");
    expect(payload.closingReadings).toEqual({ n1: "1100", n2: "2050" });
    expect(payload.creditSales).toEqual([
      { customerId: "c1", name: "Kumar Transports", phone: "9000000000", amount: "500" },
    ]);
    expect(payload.payments.credit).toBe("500");
    expect(payload.expenses).toEqual([{ label: "Tea", amount: "40" }]);
    expect(api.resubmitRejectedShift).not.toHaveBeenCalled();

    // Drafts are gone the moment the figures are safely in the database.
    expect(
      Object.keys(window.localStorage).filter((key) => key.includes("close:sh-1"))
    ).toEqual([]);
    expect(container.querySelector("[data-testid='today-home']")).toBeTruthy();
  });

  it("keeps the cash count and note in a draft across a remount", async () => {
    await mountClose("sh-1");
    const cashInputs = [...container.querySelectorAll(".card .form-grid input")];
    const cash = cashInputs.find((input) => !input.readOnly);
    await type(cash, "9000");
    const note = [...container.querySelectorAll("input")].find(
      (input) => input.placeholder === "Meter 2 sticking"
    );
    await type(note, "Meter 2 sticking");

    await act(async () => {
      root.unmount();
    });
    container.remove();
    await mountClose("sh-1");

    const restored = [...container.querySelectorAll(".card .form-grid input")];
    expect(restored.find((input) => !input.readOnly).value).toBe("9000");
    expect(
      [...container.querySelectorAll("input")].find(
        (input) => input.placeholder === "Meter 2 sticking"
      ).value
    ).toBe("Meter 2 sticking");
  });

  /**
   * Characterisation, not endorsement: useDraft projects a stored draft onto
   * the shape of its initial value, and the readings draft starts life as an
   * empty object, so it has no shape to project onto and comes back empty.
   * Typed readings therefore do NOT survive a reload today, unlike the cash
   * count above. This is a pre-existing quirk of useDraft, recorded here so a
   * refactor of this screen cannot quietly change it in either direction.
   */
  it("does not (today) restore typed nozzle readings after a remount", async () => {
    await mountClose("sh-1");
    await type(readingInput("P1 · N1"), "1234");
    expect(
      window.localStorage.getItem("petrav.draft.close:sh-1:readings"),
      "the draft is written"
    ).toBe('{"n1":"1234"}');

    await act(async () => {
      root.unmount();
    });
    container.remove();
    await mountClose("sh-1");

    expect(readingInput("P1 · N1").value).toBe("");
  });
});

describe("correcting a sent-back shift", () => {
  it("pre-fills the submitted figures and resubmits through the correction RPC", async () => {
    await mountClose("sh-2");

    expect(container.textContent).toContain("Nozzle 2 reading looks wrong");
    expect(readingInput("P1 · N1").value).toBe("1500");

    // The expense list is editable during a correction: drop one, add one.
    const removes = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent.trim() === "remove"
    );
    await click(removes[1]);
    await click(buttonByText("Add expense"));
    const expenseRows = [...container.querySelectorAll(".credit-row")];
    const added = expenseRows.at(-1).querySelectorAll("input");
    await type(added[0], "Diesel for genset");
    await type(added[1], "300");

    await click(buttonByText("Resubmit for review"));
    await settle();

    expect(api.closeShift).not.toHaveBeenCalled();
    expect(api.resubmitRejectedShift).toHaveBeenCalledTimes(1);
    const [stationId, shiftId, payload] = api.resubmitRejectedShift.mock.calls[0];
    expect(stationId).toBe("s1");
    expect(shiftId).toBe("sh-2");
    expect(payload.closingReadings).toEqual({ n1: "1500", n2: "2500" });
    expect(payload.expenses).toEqual([
      { label: "Tea", amount: "40" },
      { label: "Diesel for genset", amount: "300" },
    ]);
    expect(payload.testing).toEqual({ MS: "50", HSD: "" });
    expect(container.querySelector("[data-testid='detail']")).toBeTruthy();
  });
});
