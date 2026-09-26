// @vitest-environment jsdom
/**
 * Unit tests for the close-shift form's logic, with no screen in the way.
 *
 * CloseShift.flow.test.jsx already drives the rendered screen; this covers
 * the same rules one level down, where a failing assertion points at the
 * rule rather than at the markup: what is loaded, what validation blocks,
 * how the editable expense list behaves during a correction, and exactly
 * what a successful submit sends and clears.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useCloseShiftForm } from "./useCloseShiftForm.js";

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

const station = vi.hoisted(() => ({ stationId: "s1", loading: false }));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => station,
}));

const navigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

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

/** Mount the hook for `shiftId` and hand back a live view of its result. */
async function mountHook(shiftId) {
  const view = { current: null };
  function Probe() {
    view.current = useCloseShiftForm();
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[`/today/shift/${shiftId}/close`]}>
        <Routes>
          <Route path="/today/shift/:id/close" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await settle();
  return view;
}

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Run something that updates hook state, then let effects flush. */
async function apply(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

beforeEach(() => {
  window.localStorage.clear();
  auth.profile = { uid: "u-att", role: "attendant", name: "Ravi" };
  station.stationId = "s1";
  station.loading = false;
  api.listShifts.mockResolvedValue([OPEN_SHIFT, REJECTED_SHIFT]);
  api.listCustomerDirectory.mockResolvedValue([{ id: "c1", name: "Kumar", phone: "9" }]);
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

describe("useCloseShiftForm: initial load", () => {
  it("loads the shift and the customer directory for the active station", async () => {
    const view = await mountHook("sh-1");

    expect(api.listShifts).toHaveBeenCalledWith("s1");
    expect(api.listCustomerDirectory).toHaveBeenCalledWith("s1");
    expect(view.current.loading).toBe(false);
    expect(view.current.shift.id).toBe("sh-1");
    expect(view.current.customers).toEqual([{ id: "c1", name: "Kumar", phone: "9" }]);
    expect(view.current.loadError).toBe("");
    expect(view.current.isCorrection).toBe(false);
    // An ordinary close shows the expenses recorded while the shift ran.
    expect(view.current.expenses).toEqual([{ label: "Tea", amount: "40" }]);
    expect(view.current.back).toBe("/today/shift/sh-1");
  });

  it("surfaces a load failure without losing the screen", async () => {
    api.listShifts.mockRejectedValue(new Error("Network unreachable"));
    const view = await mountHook("sh-1");

    expect(view.current.loadError).toBe("Network unreachable");
    expect(view.current.shift).toBeNull();
  });

  it("still loads when the customer directory is unavailable", async () => {
    api.listCustomerDirectory.mockRejectedValue(new Error("nope"));
    const view = await mountHook("sh-1");

    expect(view.current.loadError).toBe("");
    expect(view.current.shift.id).toBe("sh-1");
    expect(view.current.customers).toEqual([]);
  });
});

describe("useCloseShiftForm: validation", () => {
  it("blocks a submit whose reading is below the opening, and names the nozzle", async () => {
    const view = await mountHook("sh-1");
    await apply(() => view.current.setClosings({ n1: "900", n2: "2100" }));
    await apply(() => view.current.submit());

    expect(api.closeShift).not.toHaveBeenCalled();
    expect(view.current.problems).toHaveLength(1);
    expect(view.current.problems[0]).toContain("P1 · N1");
    expect(view.current.problems[0]).toContain("below opening");
    expect(view.current.busy).toBe(false);
  });

  it("blocks a submit with a missing reading", async () => {
    const view = await mountHook("sh-1");
    await apply(() => view.current.setClosings({ n1: "1100" }));
    await apply(() => view.current.submit());

    expect(api.closeShift).not.toHaveBeenCalled();
    expect(view.current.problems).toEqual([
      expect.stringContaining("closing reading is required"),
    ]);
  });

  it("clears earlier problems once the readings are fixed", async () => {
    const view = await mountHook("sh-1");
    await apply(() => view.current.setClosings({ n1: "900", n2: "2100" }));
    await apply(() => view.current.submit());
    expect(view.current.problems).not.toHaveLength(0);

    await apply(() => view.current.setClosings({ n1: "1100", n2: "2100" }));
    await apply(() => view.current.submit());

    expect(view.current.problems).toEqual([]);
    expect(api.closeShift).toHaveBeenCalledTimes(1);
  });
});

describe("useCloseShiftForm: the expense list during a correction", () => {
  it("seeds from the submitted expenses and adds a row", async () => {
    const view = await mountHook("sh-2");
    expect(view.current.isCorrection).toBe(true);
    expect(view.current.expenses).toEqual([
      { label: "Tea", amount: "40" },
      { label: "Air pump repair", amount: "150" },
    ]);

    await apply(() =>
      view.current.setEditedExpenses((rows) => [
        ...rows,
        { label: "Diesel for genset", amount: "300" },
      ])
    );

    expect(view.current.expenses).toHaveLength(3);
    // The running total follows the list immediately.
    expect(view.current.preview.expensesTotal).toBe(490);
  });

  it("removes a row", async () => {
    const view = await mountHook("sh-2");
    await apply(() =>
      view.current.setEditedExpenses((rows) => rows.filter((_, index) => index !== 1))
    );

    expect(view.current.expenses).toEqual([{ label: "Tea", amount: "40" }]);
    expect(view.current.preview.expensesTotal).toBe(40);
  });

  it("leaves the expense list alone for an ordinary close", async () => {
    const view = await mountHook("sh-1");
    await apply(() =>
      view.current.setEditedExpenses([{ label: "Ignored", amount: "999" }])
    );

    // Not a correction: the shift's own recorded expenses still stand.
    expect(view.current.expenses).toEqual([{ label: "Tea", amount: "40" }]);
  });
});

describe("useCloseShiftForm: submitting", () => {
  it("sends one payload, clears the drafts and goes home", async () => {
    const view = await mountHook("sh-1");
    await apply(() => view.current.setClosings({ n1: "1100", n2: "2050" }));
    await apply(() => view.current.setTesting({ MS: "200", HSD: "" }));
    await apply(() =>
      view.current.setCreditSales([
        { customerId: "c1", name: "Kumar", phone: "9", amount: "500" },
      ])
    );
    await apply(() =>
      view.current.setPayments((current) => ({ ...current, cash: "9000" }))
    );
    await apply(() => view.current.setNote("Meter 2 sticking"));

    // Credit is mirrored into the payment breakdown, not asked for twice.
    expect(view.current.payments.credit).toBe("500");

    await apply(() => view.current.submit());

    expect(api.resubmitRejectedShift).not.toHaveBeenCalled();
    expect(api.closeShift).toHaveBeenCalledTimes(1);
    expect(api.closeShift).toHaveBeenCalledWith("s1", "sh-1", {
      closingReadings: { n1: "1100", n2: "2050" },
      creditSales: [{ customerId: "c1", name: "Kumar", phone: "9", amount: "500" }],
      payments: { cash: "9000", card: "", upi: "", credit: "500", other: "" },
      testing: { MS: "200", HSD: "" },
      note: "Meter 2 sticking",
      expenses: [{ label: "Tea", amount: "40" }],
    });

    expect(
      Object.keys(window.localStorage).filter((key) => key.includes("close:sh-1"))
    ).toEqual([]);
    expect(navigate).toHaveBeenCalledWith("/today", { replace: true });
  });

  it("resubmits a correction through the reconciling RPC and returns to the detail", async () => {
    const view = await mountHook("sh-2");
    await apply(() => view.current.submit());

    expect(api.closeShift).not.toHaveBeenCalled();
    const [stationId, shiftId, payload] = api.resubmitRejectedShift.mock.calls[0];
    expect(stationId).toBe("s1");
    expect(shiftId).toBe("sh-2");
    expect(payload.closingReadings).toEqual({ n1: "1500", n2: "2500" });
    expect(payload.testing).toEqual({ MS: "50", HSD: "" });
    expect(navigate).toHaveBeenCalledWith("/today/history/sh-2", { replace: true });
  });

  it("keeps the drafts and reports the error when the RPC fails", async () => {
    api.closeShift.mockRejectedValue(new Error("close_shift: nozzle already claimed"));
    const view = await mountHook("sh-1");
    await apply(() => view.current.setClosings({ n1: "1100", n2: "2050" }));
    await apply(() => view.current.submit());

    expect(view.current.error).toBe("close_shift: nozzle already claimed");
    expect(view.current.busy).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("petrav.draft.close:sh-1:readings")).toBe(
      '{"n1":"1100","n2":"2050"}'
    );
  });
});
