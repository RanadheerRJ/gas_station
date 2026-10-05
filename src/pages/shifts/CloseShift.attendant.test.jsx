// @vitest-environment jsdom
/**
 * The close-shift flow as an attendant experiences it, pinned.
 *
 * CloseShift.flow.test.jsx already proves the submit payload and drafts
 * survive any refactor. This file pins the presentation layer built on top:
 * the step bar's honesty, the live "Sold" line, the friendly below-opening
 * error, the cash verdict pill, and that the "Check before sending" card
 * states exactly the figures the existing math computes — plus a
 * byte-identical payload assertion of our own, so this file fails first if
 * presentation ever leaks into the RPC.
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
  listShiftCredit: vi.fn(),
  closeShift: vi.fn(),
  resubmitRejectedShift: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  listShifts: api.listShifts,
  listCustomerDirectory: api.listCustomerDirectory,
  listShiftCredit: api.listShiftCredit,
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
  startTime: "2026-10-05T06:00:00.000Z",
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
  nozzles: OPEN_SHIFT.nozzles.map((nozzle, index) => ({
    ...nozzle,
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

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountClose(shiftId = "sh-1") {
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

/** The payments input for a mode, found by its visible field label. */
function paymentInput(labelText) {
  const field = [...container.querySelectorAll(".field")].find((el) =>
    (el.querySelector("span")?.textContent || "").startsWith(labelText)
  );
  return field?.querySelector("input");
}

function buttonByText(text) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === text
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.listShifts.mockResolvedValue([OPEN_SHIFT, REJECTED_SHIFT]);
  api.listShiftCredit.mockResolvedValue([]);
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
  window.sessionStorage.clear();
});

describe("the step bar", () => {
  it("names the first step that wants attention", async () => {
    await mountClose();
    const bar = container.querySelector(".step-progress");
    expect(bar.getAttribute("aria-label")).toBe("Step 1 of 6: Closing readings");
  });

  it("fills the readings step and moves on to the cash count", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");

    // Review-only steps need nothing, so after the readings the first step
    // that still wants typing is the cash count.
    const bar = container.querySelector(".step-progress");
    expect(bar.getAttribute("aria-label")).toBe("Step 5 of 6: What you collected");
    const dots = [...container.querySelectorAll(".step-progress__dot")];
    expect(dots[0].dataset.state).toBe("done");
    expect(dots[0].querySelector("svg")).toBeTruthy();
    expect(dots.map((dot) => dot.dataset.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
      "todo",
    ]);
  });

  it("reaches the ready state once the cash is counted", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");
    await type(paymentInput("Cash"), "14460");

    const bar = container.querySelector(".step-progress");
    expect(bar.dataset.complete).toBe("true");
    expect(container.querySelector(".step-progress__label").textContent).toContain(
      "All steps filled"
    );
  });
});

describe("the readings blocks", () => {
  it("computes sold litres live as each closing reading is typed", async () => {
    await mountClose();
    const rows = [...container.querySelectorAll(".closing-row")];
    expect(rows[0].querySelector(".closing-row__sold").textContent.trim()).toBe("—");

    await type(readingInput("P1 · N1"), "1100");
    expect(rows[0].querySelector(".closing-row__sold").textContent).toContain(
      "Sold: 100.00 L"
    );
    expect(rows[1].querySelector(".closing-row__sold").textContent.trim()).toBe("—");
  });

  it("explains a below-opening reading inline, kindly, and links it to the input", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "900");

    const input = readingInput("P1 · N1");
    const row = container.querySelector(".closing-row");
    expect(row.dataset.bad).toBe("true");
    const error = row.querySelector(".closing-row__error");
    expect(error.textContent).toContain("Lower than the opening reading");
    expect(error.textContent).toContain("Check the pump display");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("keeps the opening meter visible, read-only", async () => {
    await mountClose();
    const row = container.querySelector(".closing-row");
    expect(row.querySelector(".closing-row__figure strong").textContent).toBe("1,000.00");
    expect(row.querySelectorAll(".closing-row__figure input")).toHaveLength(1);
  });
});

describe("the cash verdict", () => {
  async function typeReadingsAndCash(cash) {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");
    await type(paymentInput("Cash"), cash);
    return container.querySelector(".variance-pill");
  }

  it("stays quiet until the cash is counted", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    const pill = container.querySelector(".variance-pill");
    expect(pill.className).toContain("variance-pill--quiet");
    expect(pill.textContent).toContain("Cash not counted yet");
  });

  it("says Matches when the count equals the handover figure", async () => {
    // gross 14,500 − expenses 40 = net 14,460 to hand over.
    const pill = await typeReadingsAndCash("14460");
    expect(pill.className).toContain("variance-pill--ok");
    expect(pill.textContent).toContain("Matches");
  });

  it("says Short with the rupee amount when the count is under", async () => {
    const pill = await typeReadingsAndCash("14400");
    expect(pill.className).toContain("variance-pill--short");
    expect(pill.textContent).toContain("Short ₹60.00");
  });

  it("says Over with the rupee amount when the count is above", async () => {
    const pill = await typeReadingsAndCash("14500");
    expect(pill.className).toContain("variance-pill--over");
    expect(pill.textContent).toContain("Over ₹40.00");
  });

  it("shows the cash you should hand over next to the inputs", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");
    expect(container.querySelector(".cash-check").textContent).toContain(
      "Cash to hand over"
    );
    expect(container.querySelector(".cash-check .money").textContent).toContain(
      "14,460.00"
    );
  });
});

describe("check before sending", () => {
  it("restates exactly the figures the existing math computes", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");

    // One credit sale of 500 against a known customer.
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

    await type(paymentInput("Cash"), "9000");

    // gross 14,500; received 9,500 (9,000 cash + 500 credit); expenses 40.
    expect(container.querySelector('[data-testid="check-sales"]').textContent).toContain(
      "14,500.00"
    );
    expect(
      container.querySelector('[data-testid="check-received"]').textContent
    ).toContain("9,500.00");
    expect(container.querySelector('[data-testid="check-credit"]').textContent).toContain(
      "500.00"
    );
    expect(
      container.querySelector('[data-testid="check-expenses"]').textContent
    ).toContain("40.00");
    expect(container.querySelector('[data-testid="check-cash"]').textContent).toContain(
      "9,000.00"
    );

    // The credit line names the customer the attendant entered.
    const lines = container.querySelector('[data-testid="check-credit-lines"]');
    expect(lines.textContent).toContain("Kumar Transports");
    expect(lines.textContent).toContain("500.00");
  });
});

describe("submitting", () => {
  it("sends a byte-identical payload and leaves the sent note for Today", async () => {
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");
    await type(paymentInput("Cash"), "9000");
    await click(buttonByText("Close shift & send for review"));
    await settle();

    expect(api.closeShift).toHaveBeenCalledTimes(1);
    const [stationId, shiftId, payload] = api.closeShift.mock.calls[0];
    expect(stationId).toBe("s1");
    expect(shiftId).toBe("sh-1");
    expect(payload).toEqual({
      closingReadings: { n1: "1100", n2: "2050" },
      creditSales: [],
      payments: { cash: "9000", card: "", upi: "", credit: "", other: "" },
      testing: { MS: "", HSD: "" },
      note: "",
      expenses: [{ label: "Tea", amount: "40" }],
    });

    // Today shows the confirmation exactly once, from this note.
    expect(window.sessionStorage.getItem("petrav.flash.shiftSent")).toBe("sh-1");
    expect(container.querySelector("[data-testid='today-home']")).toBeTruthy();
  });

  it("reassures that nothing is lost when the submit fails", async () => {
    api.closeShift.mockRejectedValue(new Error("network down"));
    await mountClose();
    await type(readingInput("P1 · N1"), "1100");
    await type(readingInput("P1 · N2"), "2050");
    await click(buttonByText("Close shift & send for review"));
    await settle();

    expect(container.querySelector(".notice.error").textContent).toContain(
      "network down"
    );
    expect(container.querySelector(".draft-note").textContent).toContain(
      "stays saved on this phone"
    );
    // And the drafts really are still there.
    expect(window.localStorage.getItem("petrav.draft.close:sh-1:readings")).toBe(
      '{"n1":"1100","n2":"2050"}'
    );
  });
});

describe("correcting a sent-back shift", () => {
  it("keeps the reviewer's reason in a persistent amber banner", async () => {
    await mountClose("sh-2");

    const banner = container.querySelector(".notice.attention");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("Sent back by Owner");
    expect(banner.textContent).toContain("Nozzle 2 reading looks wrong");
    expect(banner.textContent).toContain("Fix the flagged figures and send it again.");
  });

  it("highlights a reading that no longer matches what was submitted", async () => {
    await mountClose("sh-2");

    // Seeded from the submission: n1 = 1500, n2 = 2500 — no flags yet.
    expect(container.querySelector(".changed-flag")).toBeNull();

    await type(readingInput("P1 · N1"), "1600");
    const rows = [...container.querySelectorAll(".closing-row")];
    expect(rows[0].querySelector(".changed-flag").textContent).toContain("Edited");
    expect(rows[1].querySelector(".changed-flag")).toBeNull();
  });

  it("flags nothing on an ordinary close", async () => {
    await mountClose("sh-1");
    await type(readingInput("P1 · N1"), "1100");
    expect(container.querySelector(".changed-flag")).toBeNull();
  });

  it("starts from the submitted figures with the step bar already settled", async () => {
    await mountClose("sh-2");

    expect(readingInput("P1 · N1").value).toBe("1500");
    // Readings valid and cash seeded: nothing left to type.
    expect(container.querySelector(".step-progress").dataset.complete).toBe("true");
  });
});
