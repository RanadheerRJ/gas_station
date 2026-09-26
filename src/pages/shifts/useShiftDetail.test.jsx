// @vitest-environment jsdom
/**
 * Unit tests for the shift-detail hooks.
 *
 * useShiftDetail decides who may do what to a settled shift — the review
 * boundary the RBAC suite enforces in the database, mirrored in the UI — and
 * useSettledShiftDetail owns the reviewer's working copy. Both are worth
 * asserting directly: a permission that silently flips to true here shows a
 * manager a button the database will refuse.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useShiftDetail } from "./useShiftDetail.js";
import { useSettledShiftDetail } from "./useSettledShiftDetail.js";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listCustomers: vi.fn(),
  approveShift: vi.fn(),
  rejectShift: vi.fn(),
  reviseShift: vi.fn(),
  reopenShiftForCorrection: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  listShifts: api.listShifts,
  listCustomers: api.listCustomers,
  approveShift: api.approveShift,
  rejectShift: api.rejectShift,
  reviseShift: api.reviseShift,
  reopenShiftForCorrection: api.reopenShiftForCorrection,
  readableError: (error) => String(error?.message || error),
}));

const auth = vi.hoisted(() => ({ profile: null }));

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    station: { id: "s1", name: "Main Road" },
    stationId: "s1",
    link: (to) => to,
    loading: false,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BASE = {
  id: "sh-1",
  date: "2026-09-19",
  employeeName: "Ravi",
  userId: "u-att",
  nozzles: [
    {
      nozzleId: "n1",
      label: "P1 · N1",
      fuelType: "MS",
      openingReading: "1000",
      closingReading: "1100",
      price: "100",
    },
  ],
  expenses: [{ label: "Tea", amount: "40" }],
  creditSales: [],
  payments: { cash: "9000", card: "", upi: "", credit: "", other: "" },
  testing: { MS: "200", HSD: "" },
};

const SHIFTS = [
  { ...BASE, status: "pending_review" },
  { ...BASE, id: "sh-a", status: "approved" },
  { ...BASE, id: "sh-r", status: "rejected" },
];

const OWNER = { uid: "u-o", role: "owner", name: "Owner" };
const MANAGER = { uid: "u-m", role: "manager", name: "Manager" };
const ATTENDANT = { uid: "u-att", role: "attendant", name: "Ravi" };

let container = null;
let root = null;

async function mountHook(useHook, { route = "/x/sh-1", path = "/x/:id" } = {}) {
  const view = { current: null };
  function Probe() {
    view.current = useHook();
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={<Probe />} />
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

async function apply(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

beforeEach(() => {
  api.listShifts.mockResolvedValue(SHIFTS);
  api.listCustomers.mockResolvedValue([{ id: "c1", name: "Kumar", phone: "9" }]);
  api.approveShift.mockResolvedValue({ ok: true });
  api.rejectShift.mockResolvedValue({ ok: true });
  api.reviseShift.mockResolvedValue({ ok: true });
  api.reopenShiftForCorrection.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  auth.profile = null;
  vi.clearAllMocks();
});

describe("useShiftDetail: loading", () => {
  it("loads the shift and the customer directory for a reviewer", async () => {
    auth.profile = OWNER;
    const view = await mountHook(useShiftDetail);

    expect(api.listShifts).toHaveBeenCalledWith("s1");
    expect(api.listCustomers).toHaveBeenCalledWith("s1");
    expect(view.current.shift.id).toBe("sh-1");
    expect(view.current.customers).toHaveLength(1);
    expect(view.current.loadError).toBe("");
    expect(view.current.back).toBe("/owner/shifts");
  });

  it("does not ask for the customer directory as an attendant", async () => {
    auth.profile = ATTENDANT;
    const view = await mountHook(useShiftDetail);

    expect(api.listShifts).toHaveBeenCalledWith("s1");
    expect(api.listCustomers).not.toHaveBeenCalled();
    expect(view.current.customers).toEqual([]);
    expect(view.current.back).toBe("/today/history");
  });

  it("reports a load failure", async () => {
    auth.profile = OWNER;
    api.listShifts.mockRejectedValue(new Error("Network unreachable"));
    const view = await mountHook(useShiftDetail);

    expect(view.current.loadError).toBe("Network unreachable");
    expect(view.current.shift).toBeUndefined();
  });
});

describe("useShiftDetail: who may do what", () => {
  const cases = [
    // role,     shift,   canReview, canResubmit, canReopen
    [OWNER, "sh-1", true, false, true],
    [OWNER, "sh-a", true, false, true],
    [OWNER, "sh-r", true, true, false],
    [MANAGER, "sh-1", true, false, false],
    [MANAGER, "sh-a", true, false, false],
    [MANAGER, "sh-r", true, false, false],
    [ATTENDANT, "sh-1", false, false, false],
    [ATTENDANT, "sh-a", false, false, false],
    [ATTENDANT, "sh-r", false, true, false],
  ];

  it.each(cases)(
    "%o on %s",
    async (profile, shiftId, canReview, canResubmit, canReopen) => {
      auth.profile = profile;
      const view = await mountHook(useShiftDetail, { route: `/x/${shiftId}` });

      expect(view.current.canReview).toBe(canReview);
      expect(view.current.canResubmit).toBe(canResubmit);
      expect(view.current.canReopen).toBe(canReopen);
    }
  );

  it("does not offer a correction link for someone else's sent-back shift", async () => {
    auth.profile = { uid: "u-other", role: "attendant", name: "Someone else" };
    const view = await mountHook(useShiftDetail, { route: "/x/sh-r" });

    expect(view.current.canResubmit).toBe(false);
    expect(view.current.correctionUrl).toBe("");
  });

  it("points a sent-back shift at the correction form for its own operator", async () => {
    auth.profile = ATTENDANT;
    const view = await mountHook(useShiftDetail, { route: "/x/sh-r" });

    expect(view.current.correctionUrl).toBe("/today/history/sh-r/edit");
  });
});

describe("useShiftDetail: review actions", () => {
  it("approves, sends back, revises and reopens against the right shift", async () => {
    auth.profile = OWNER;
    const view = await mountHook(useShiftDetail);

    await apply(() => view.current.onApprove());
    expect(api.approveShift).toHaveBeenCalledWith("s1", "sh-1");

    await apply(() => view.current.onReject("check nozzle 2"));
    expect(api.rejectShift).toHaveBeenCalledWith("s1", "sh-1", "check nozzle 2");

    await apply(() =>
      view.current.onRevise({ expenses: [], testing: { MS: "0", HSD: "0" } })
    );
    expect(api.reviseShift).toHaveBeenCalledWith("s1", "sh-1", {
      expenses: [],
      testing: { MS: "0", HSD: "0" },
    });

    await apply(() => view.current.onReopen("wrong reading"));
    expect(api.reopenShiftForCorrection).toHaveBeenCalledWith(
      "s1",
      "sh-1",
      "wrong reading"
    );

    // Every mutation reloads the screen's data afterwards.
    expect(api.listShifts.mock.calls.length).toBeGreaterThan(4);
  });

  it("surfaces a failed mutation instead of pretending it worked", async () => {
    auth.profile = OWNER;
    api.approveShift.mockRejectedValue(new Error("approve_shift: not permitted"));
    const view = await mountHook(useShiftDetail);

    await apply(() => view.current.onApprove());

    expect(view.current.error).toBe("approve_shift: not permitted");
    expect(view.current.busy).toBe(false);
  });
});

describe("useSettledShiftDetail: the reviewer's working copy", () => {
  const shift = { ...BASE, status: "pending_review" };

  function mountPanel(overrides = {}) {
    const handlers = {
      onRevise: vi.fn().mockResolvedValue(true),
      onReject: vi.fn().mockResolvedValue(true),
      onReopen: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
    return mountHook(() => useSettledShiftDetail({ shift, ...handlers })).then(
      (view) => ({ view, handlers })
    );
  }

  it("starts from the stored figures and is not editing", async () => {
    const { view } = await mountPanel();

    expect(view.current.editing).toBe(false);
    expect(view.current.locked).toBe(false);
    expect(view.current.expenses).toEqual([{ label: "Tea", amount: "40" }]);
    expect(view.current.testing).toEqual({ MS: "200", HSD: "" });
    // Nothing edited yet, so the draft is the stored total.
    expect(view.current.draft.net).toBe(view.current.totals.net);
  });

  it("previews a correction without touching the stored totals", async () => {
    const { view } = await mountPanel();
    await apply(() => view.current.setEditing(true));
    await apply(() => view.current.setExpenses([{ label: "Tea", amount: "100" }]));

    expect(view.current.draft.expensesTotal).toBe(100);
    expect(view.current.totals.expensesTotal).toBe(40);
  });

  it("abandons an edit back to the stored figures", async () => {
    const { view } = await mountPanel();
    await apply(() => view.current.setEditing(true));
    await apply(() => view.current.setExpenses([{ label: "Tea", amount: "100" }]));
    await apply(() => view.current.cancelEditing());

    expect(view.current.editing).toBe(false);
    expect(view.current.expenses).toEqual([{ label: "Tea", amount: "40" }]);
  });

  it("closes the edit form only when the revision actually landed", async () => {
    const { view, handlers } = await mountPanel({
      onRevise: vi.fn().mockResolvedValue(false),
    });
    await apply(() => view.current.setEditing(true));
    await apply(() => view.current.submitRevision());

    expect(handlers.onRevise).toHaveBeenCalledWith({
      expenses: [{ label: "Tea", amount: "40" }],
      testing: { MS: "200", HSD: "" },
    });
    expect(view.current.editing, "stays open so the work is not lost").toBe(true);
  });

  it("trims the send-back reason and clears it once accepted", async () => {
    const { view, handlers } = await mountPanel();
    await apply(() => view.current.setRejecting(true));
    await apply(() => view.current.setReason("  check nozzle 2  "));
    await apply(() => view.current.submitRejection());

    expect(handlers.onReject).toHaveBeenCalledWith("check nozzle 2");
    expect(view.current.rejecting).toBe(false);
    expect(view.current.reason).toBe("");
  });

  it("keeps the send-back form open when the write fails", async () => {
    const { view } = await mountPanel({ onReject: vi.fn().mockResolvedValue(false) });
    await apply(() => view.current.setRejecting(true));
    await apply(() => view.current.setReason("check nozzle 2"));
    await apply(() => view.current.submitRejection());

    expect(view.current.rejecting).toBe(true);
    expect(view.current.reason).toBe("check nozzle 2");
  });

  it("reopens with a trimmed, optional reason", async () => {
    const { view, handlers } = await mountPanel();
    await apply(() => view.current.setReopening(true));
    await apply(() => view.current.submitReopen());

    expect(handlers.onReopen).toHaveBeenCalledWith("");
    expect(view.current.reopening).toBe(false);
  });

  it("locks an approved shift", async () => {
    const approved = { ...BASE, status: "approved" };
    const view = await mountHook(() =>
      useSettledShiftDetail({
        shift: approved,
        onRevise: vi.fn(),
        onReject: vi.fn(),
        onReopen: vi.fn(),
      })
    );

    expect(view.current.locked).toBe(true);
  });
});
