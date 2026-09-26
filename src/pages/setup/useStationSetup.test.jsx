// @vitest-environment jsdom
/**
 * Unit tests for the station setup hook.
 *
 * Everything here writes to the tables every later figure is derived from —
 * a nozzle's opening meter reading, a fuel's effective-dated price, which
 * tank a nozzle draws from — so the arguments that reach each RPC, and the
 * reload that follows every write, are worth asserting directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useStationSetup } from "./useStationSetup.js";

const api = vi.hoisted(() => ({
  listPumps: vi.fn(),
  getPrices: vi.fn(),
  listTanks: vi.fn(),
  addPump: vi.fn(),
  addNozzle: vi.fn(),
  mapNozzleTank: vi.fn(),
  setNozzleState: vi.fn(),
  setPumpState: vi.fn(),
  setPrice: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  listPumps: api.listPumps,
  getPrices: api.getPrices,
  listTanks: api.listTanks,
  addPump: api.addPump,
  addNozzle: api.addNozzle,
  mapNozzleTank: api.mapNozzleTank,
  setNozzleState: api.setNozzleState,
  setPumpState: api.setPumpState,
  setPrice: api.setPrice,
  readableError: (error) => String(error?.message || error),
}));

const PROFILE = { uid: "u-o", role: "owner", name: "Owner" };

vi.mock("../../state/AuthContext", () => ({
  useAuth: () => ({ profile: PROFILE }),
}));

vi.mock("../../state/useStation", () => ({
  useStation: () => ({
    stations: [{ id: "s1", name: "Main Road" }],
    station: { id: "s1", name: "Main Road" },
    stationId: "s1",
    setStation: () => {},
    loading: false,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PUMPS = {
  pumps: [
    { id: "p1", name: "Pump 1", state: "active" },
    { id: "p2", name: "Pump 2", state: "retired" },
  ],
  nozzles: [
    {
      id: "n1",
      pumpId: "p1",
      name: "N1",
      fuelType: "Petrol",
      tankId: "t1",
      state: "active",
    },
    {
      id: "n2",
      pumpId: "p1",
      name: "N2",
      fuelType: "Diesel",
      tankId: "",
      state: "retired",
    },
    {
      id: "n3",
      pumpId: "p2",
      name: "N3",
      fuelType: "Petrol",
      tankId: "",
      state: "active",
    },
  ],
};

const PRICES = [
  {
    id: "pr1",
    fuelType: "Petrol",
    price: "100",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
  },
  {
    id: "pr0",
    fuelType: "Petrol",
    price: "95",
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveTo: "2026-09-01T00:00:00.000Z",
  },
];

const TANKS = {
  tanks: [
    { id: "t1", name: "Tank A", fuelType: "petrol", state: "active" },
    { id: "t2", name: "Retired tank", fuelType: "diesel", state: "retired" },
  ],
};

let container = null;
let root = null;

async function mountHook() {
  const view = { current: null };
  function Probe() {
    view.current = useStationSetup();
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Probe />);
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
  api.listPumps.mockResolvedValue(PUMPS);
  api.getPrices.mockResolvedValue(PRICES);
  api.listTanks.mockResolvedValue(TANKS);
  api.addPump.mockResolvedValue({ ok: true });
  api.addNozzle.mockResolvedValue({ ok: true });
  api.mapNozzleTank.mockResolvedValue({ ok: true });
  api.setNozzleState.mockResolvedValue({ ok: true });
  api.setPumpState.mockResolvedValue({ ok: true });
  api.setPrice.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

describe("useStationSetup: loading", () => {
  it("loads equipment, prices and tanks for the station", async () => {
    const view = await mountHook();

    expect(api.listPumps).toHaveBeenCalledWith("s1");
    expect(api.getPrices).toHaveBeenCalledWith("s1");
    expect(api.listTanks).toHaveBeenCalledWith("s1");
    expect(view.current.loading).toBe(false);
    expect(view.current.pumps).toHaveLength(2);
    expect(view.current.nozzles).toHaveLength(3);
    expect(view.current.error).toBe("");
  });

  it("hides retired tanks, which cannot receive a nozzle mapping", async () => {
    const view = await mountHook();

    expect(view.current.tanks.map((tank) => tank.id)).toEqual(["t1"]);
  });

  it("asks for a price only for the fuels this station actually dispenses", async () => {
    const view = await mountHook();

    expect(view.current.activeFuels).toEqual(["Petrol", "Diesel"]);
    // The active price is the open-ended record, not the superseded one.
    expect(view.current.active.Petrol.price).toBe("100");
  });

  it("reports a load failure", async () => {
    api.listPumps.mockRejectedValue(new Error("Network unreachable"));
    const view = await mountHook();

    expect(view.current.error).toBe("Network unreachable");
  });
});

describe("useStationSetup: writes", () => {
  it("adds a pump, clears the field and reloads", async () => {
    const view = await mountHook();
    await apply(() => view.current.setPumpName("  Pump 3  "));
    await apply(() => view.current.submitPump());

    expect(api.addPump).toHaveBeenCalledWith("s1", { name: "Pump 3" });
    expect(view.current.pumpName).toBe("");
    expect(api.listPumps).toHaveBeenCalledTimes(2);
  });

  it("adds a nozzle with a numeric opening reading and closes the form", async () => {
    const view = await mountHook();
    await apply(() => view.current.toggleNozzleForm("p1"));
    expect(view.current.nozzleFor).toBe("p1");

    await apply(() =>
      view.current.setNozzleForm({
        name: "  N4 ",
        fuelType: "Diesel",
        openingReading: "1234.5",
      })
    );
    await apply(() => view.current.submitNozzle("p1"));

    expect(api.addNozzle).toHaveBeenCalledWith("s1", {
      pumpId: "p1",
      name: "N4",
      fuelType: "Diesel",
      openingReading: 1234.5,
    });
    expect(view.current.nozzleFor).toBeNull();
  });

  it("opens the nozzle form blank and closes it on a second tap", async () => {
    const view = await mountHook();
    await apply(() => view.current.toggleNozzleForm("p1"));
    await apply(() =>
      view.current.setNozzleForm({ name: "N9", fuelType: "CNG", openingReading: "5" })
    );
    await apply(() => view.current.toggleNozzleForm("p1"));

    expect(view.current.nozzleFor).toBeNull();
    expect(view.current.nozzleForm).toEqual({
      name: "",
      fuelType: "Petrol",
      openingReading: "",
    });
  });

  it("sets a price as a number, attributed to the signed-in account", async () => {
    const view = await mountHook();
    await apply(() => view.current.updatePrice("Petrol", "102.50"));

    expect(api.setPrice).toHaveBeenCalledWith(
      "s1",
      { fuelType: "Petrol", price: 102.5 },
      PROFILE
    );
    expect(api.getPrices).toHaveBeenCalledTimes(2);
  });

  it("toggles a pump and a nozzle between active and retired", async () => {
    const view = await mountHook();

    await apply(() => view.current.togglePumpState({ id: "p1", state: "active" }));
    expect(api.setPumpState).toHaveBeenCalledWith("s1", "p1", "retired");

    await apply(() => view.current.togglePumpState({ id: "p2", state: "retired" }));
    expect(api.setPumpState).toHaveBeenCalledWith("s1", "p2", "active");

    await apply(() => view.current.toggleNozzleState({ id: "n2", state: "retired" }));
    expect(api.setNozzleState).toHaveBeenCalledWith("s1", "n2", "active");

    await apply(() => view.current.toggleNozzleState({ id: "n1", state: "active" }));
    expect(api.setNozzleState).toHaveBeenCalledWith("s1", "n1", "retired");
  });

  it("maps a nozzle to a tank", async () => {
    const view = await mountHook();
    await apply(() => view.current.assignTank("n2", "t1"));

    expect(api.mapNozzleTank).toHaveBeenCalledWith("s1", "n2", "t1");
  });

  it("surfaces a failed write and stops being busy", async () => {
    api.addPump.mockRejectedValue(new Error("add_pump: duplicate name"));
    const view = await mountHook();
    await apply(() => view.current.setPumpName("Pump 1"));
    await apply(() => view.current.submitPump());

    expect(view.current.error).toBe("add_pump: duplicate name");
    expect(view.current.busy).toBe(false);
    // The failed write did not reload; the screen still shows what it had.
    expect(api.listPumps).toHaveBeenCalledTimes(1);
  });

  it("drops half-typed price drafts when the data reloads", async () => {
    const view = await mountHook();
    await apply(() => view.current.setRateDraft({ Petrol: "999" }));
    await apply(() => view.current.load());

    expect(view.current.rateDraft).toEqual({});
  });
});
