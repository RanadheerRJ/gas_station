// @vitest-environment jsdom
/**
 * The add-nozzle sheet: the way onto a running shift's nozzle list.
 *
 * Pins what the operator is offered — the shift's own nozzles to give back,
 * free nozzles to take, another shift's nozzles only to read — what leaves
 * for the database when a nozzle is taken, and that giving one back is asked
 * for twice, because only a nozzle nothing was drawn through is safe to
 * release.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import AddNozzlesSheet from "./AddNozzlesSheet.jsx";

const api = vi.hoisted(() => ({
  listPumps: vi.fn(),
  listNozzleOccupancy: vi.fn(),
  listShifts: vi.fn(),
  addShiftNozzles: vi.fn(),
  removeShiftNozzle: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listPumps: api.listPumps,
    listNozzleOccupancy: api.listNozzleOccupancy,
    listShifts: api.listShifts,
    addShiftNozzles: api.addShiftNozzles,
    removeShiftNozzle: api.removeShiftNozzle,
    readableError: (error) => String(error?.message || error),
  };
});

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: { uid: "u-att", role: "attendant", name: "Ravi" } }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PUMPS = [{ id: "p1", name: "Pump 1" }];

const NOZZLES = [
  {
    id: "n1",
    pumpId: "p1",
    name: "N1",
    fuelType: "Petrol",
    lastReading: "1000",
    state: "active",
  },
  {
    id: "n2",
    pumpId: "p1",
    name: "N2",
    fuelType: "Diesel",
    lastReading: "2000",
    state: "active",
  },
  {
    id: "n3",
    pumpId: "p1",
    name: "N3",
    fuelType: "Petrol",
    lastReading: "3000",
    state: "active",
  },
  {
    id: "n4",
    pumpId: "p1",
    name: "N4",
    fuelType: "Petrol",
    lastReading: "4000",
    state: "retired",
  },
];

/** The shift holds N1; Ben's shift holds N2, so N3 is the only free nozzle. */
const SHIFT = {
  id: "sh-1",
  status: "open",
  nozzles: [
    {
      nozzleId: "n1",
      label: "P1 · N1",
      fuelType: "Petrol",
      openingReading: "1000",
      price: "100",
    },
  ],
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

async function mountSheet(props = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <AddNozzlesSheet
          open
          onClose={() => {}}
          shift={SHIFT}
          stationId="s1"
          onChange={props.onChange || (() => Promise.resolve())}
          {...props}
        />
      </LanguageProvider>
    );
  });
  await settle();
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const body = () => document.body;
const buttonNamed = (name) =>
  [...body().querySelectorAll("button")].find(
    (button) => button.textContent.trim() === name
  );

beforeEach(() => {
  api.listPumps.mockResolvedValue({ pumps: PUMPS, nozzles: NOZZLES });
  api.listNozzleOccupancy.mockResolvedValue(["n2"]);
  api.addShiftNozzles.mockResolvedValue({ ok: true, shiftId: "sh-1" });
  api.removeShiftNozzle.mockResolvedValue({ ok: true, shiftId: "sh-1" });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("the add-nozzle sheet", () => {
  it("shows the shift's own nozzle with the reading it opened on", async () => {
    await mountSheet();
    const held = body().querySelector('[data-testid="held-n1"]');
    expect(held.textContent).toContain("N1");
    expect(held.textContent).toContain("On this shift");
    expect(held.textContent).toContain("1,000.00");
    expect(held.querySelector("button").textContent.trim()).toBe("Remove");
  });

  it("offers only free nozzles, and says why the others are not", async () => {
    await mountSheet();
    // N2 belongs to another shift: readable, and refused rather than hidden.
    const taken = [...body().querySelectorAll(".nozzle-row.busy")];
    expect(taken).toHaveLength(1);
    expect(taken[0].disabled).toBe(true);
    expect(taken[0].textContent).toContain("N2");
    expect(taken[0].textContent).toContain("Busy");
  });

  it("keeps a retired nozzle out of the way", async () => {
    await mountSheet();
    expect(body().textContent).not.toContain("N4");
  });

  it("sends exactly the nozzles the operator ticked, then refreshes", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    await mountSheet({ onChange });
    const free = [...body().querySelectorAll("button.nozzle-row:not(.busy)")];
    expect(free).toHaveLength(1);
    expect(free[0].textContent).toContain("N3");

    await click(free[0]);
    expect(free[0].getAttribute("aria-pressed")).toBe("true");
    await click(buttonNamed("Add 1 nozzle"));

    expect(api.addShiftNozzles).toHaveBeenCalledWith("s1", "sh-1", ["n3"]);
    expect(onChange).toHaveBeenCalled();
  });

  it("will not send an empty selection", async () => {
    await mountSheet();
    expect(buttonNamed("Add 0 nozzles").disabled).toBe(true);
  });

  it("asks twice before giving a nozzle back, then sends it", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    await mountSheet({ onChange });
    const held = body().querySelector('[data-testid="held-n1"]');

    await click(held.querySelector("button"));
    // The first press only asks the question.
    expect(api.removeShiftNozzle).not.toHaveBeenCalled();
    expect(held.textContent).toContain("Remove?");

    await click(
      [...held.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Confirm"
      )
    );
    expect(api.removeShiftNozzle).toHaveBeenCalledWith("s1", "sh-1", "n1");
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the nozzle when the question is answered no", async () => {
    await mountSheet();
    const held = body().querySelector('[data-testid="held-n1"]');
    await click(held.querySelector("button"));
    await click(
      [...held.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Cancel"
      )
    );
    expect(api.removeShiftNozzle).not.toHaveBeenCalled();
    expect(held.textContent).toContain("On this shift");
  });
});
