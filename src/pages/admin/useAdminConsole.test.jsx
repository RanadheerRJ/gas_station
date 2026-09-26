// @vitest-environment jsdom
/**
 * Unit tests for the developer console hook.
 *
 * Two things here are worth pinning down: an owner's opening PIN is shown
 * once and never stored, and a missing station registry must read as "could
 * not ask" rather than "there are none".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BLANK, useAdminConsole } from "./useAdminConsole.js";

const api = vi.hoisted(() => ({
  listOwners: vi.fn(),
  adminStationRegistry: vi.fn(),
  listOwnerStaff: vi.fn(),
  createOwner: vi.fn(),
}));

vi.mock("../../lib/api", async () => ({
  // The real PIN rule, so "complete" means what the screen means by it.
  pinProblem: (await import("../../lib/pin.js")).pinProblem,
  listOwners: api.listOwners,
  adminStationRegistry: api.adminStationRegistry,
  listOwnerStaff: api.listOwnerStaff,
  createOwner: api.createOwner,
  readableError: (error) => String(error?.message || error),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OWNERS = [
  { uid: "o1", name: "Ravi Kumar", username: "ravi.k", phone: "+91 98480 11223" },
  { uid: "o2", name: "Sita Devi", username: "sita.d", phone: "+91 98480 99887" },
];

const REGISTRY = [
  {
    stationId: "s1",
    name: "Highway 44",
    address: "NH-44",
    state: "active",
    ownerId: "o1",
  },
  {
    stationId: "s2",
    name: "Old Depot",
    address: "Market Rd",
    state: "archived",
    ownerId: "o1",
  },
  { stationId: "s3", name: "Bypass", address: "Ring Rd", state: "active", ownerId: "o2" },
];

const FILLED = {
  ownerName: " Ravi Kumar ",
  stationName: " Highway 44 ",
  phone: " +91 98480 11223 ",
  address: " NH-44 ",
  pin: "1357",
  confirmPin: "1357",
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

async function mountHook() {
  const view = { current: null };
  function Probe() {
    view.current = useAdminConsole();
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

async function apply(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

beforeEach(() => {
  api.listOwners.mockResolvedValue(OWNERS);
  api.adminStationRegistry.mockResolvedValue(REGISTRY);
  api.listOwnerStaff.mockResolvedValue([
    {
      uid: "m1",
      name: "Manager M",
      username: "m.m",
      role: "manager",
      stationIds: ["s1"],
    },
  ]);
  api.createOwner.mockResolvedValue({ username: "ravi.k" });
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

describe("useAdminConsole: loading", () => {
  it("loads owners and the station registry", async () => {
    const view = await mountHook();

    expect(view.current.loadingOwners).toBe(false);
    expect(view.current.owners).toHaveLength(2);
    expect(view.current.registry).toHaveLength(3);
    expect(view.current.activeStations).toBe(2);
  });

  it("groups stations under the owner that holds them", async () => {
    const view = await mountHook();

    expect(view.current.stationsFor("o1").map((s) => s.stationId)).toEqual(["s1", "s2"]);
    expect(view.current.stationsFor("o2")).toHaveLength(1);
    expect(view.current.stationsFor("nobody")).toEqual([]);
  });

  it("keeps a null registry distinct from an empty one", async () => {
    api.adminStationRegistry.mockRejectedValue(new Error("function not deployed"));
    const view = await mountHook();

    // Null means "could not ask", so counts stay unknown rather than zero.
    expect(view.current.registry).toBeNull();
    expect(view.current.activeStations).toBeNull();
    expect(view.current.stationsFor("o1")).toBeNull();
    // A failed registry must not take the owner list down with it.
    expect(view.current.owners).toHaveLength(2);
  });

  it("falls back to an empty owner list when that lookup fails", async () => {
    api.listOwners.mockRejectedValue(new Error("denied"));
    const view = await mountHook();

    expect(view.current.owners).toEqual([]);
    expect(view.current.loadingOwners).toBe(false);
  });
});

describe("useAdminConsole: staff roster", () => {
  it("fetches a roster on first expand, and caches it after", async () => {
    const view = await mountHook();
    await apply(() => view.current.toggleStaff(OWNERS[0]));

    expect(api.listOwnerStaff).toHaveBeenCalledWith(OWNERS[0]);
    expect(view.current.staffOpen).toBe("o1");
    expect(view.current.staff.o1.rows).toHaveLength(1);

    await apply(() => view.current.toggleStaff(OWNERS[0]));
    expect(view.current.staffOpen).toBeNull();

    await apply(() => view.current.toggleStaff(OWNERS[0]));
    expect(api.listOwnerStaff).toHaveBeenCalledTimes(1);
  });

  it("records a roster failure against that owner only", async () => {
    api.listOwnerStaff.mockRejectedValue(new Error("staff rpc missing"));
    const view = await mountHook();
    await apply(() => view.current.toggleStaff(OWNERS[0]));

    expect(view.current.staff.o1).toEqual({ rows: [], error: "staff rpc missing" });
    expect(view.current.staff.o2).toBeUndefined();
  });
});

describe("useAdminConsole: creating an owner", () => {
  const preventDefault = () => ({ preventDefault: () => {} });

  it("requires every field, a valid phone and a matching PIN", async () => {
    const view = await mountHook();
    expect(view.current.complete).toBeFalsy();

    await apply(() => view.current.setForm(FILLED));
    expect(view.current.phoneKey).toBeNull();
    expect(view.current.complete).toBeTruthy();

    await apply(() => view.current.setForm({ ...FILLED, confirmPin: "2468" }));
    expect(view.current.complete).toBeFalsy();

    await apply(() => view.current.setForm({ ...FILLED, phone: "12345" }));
    expect(view.current.phoneKey).toBeTruthy();
    expect(view.current.complete).toBeFalsy();

    await apply(() => view.current.setForm({ ...FILLED, address: "   " }));
    expect(view.current.complete).toBeFalsy();
  });

  it("submits trimmed fields, shows the PIN once and reloads", async () => {
    const view = await mountHook();
    await apply(() => view.current.setForm(FILLED));
    await apply(() => view.current.submit(preventDefault()));

    expect(api.createOwner).toHaveBeenCalledWith({
      ownerName: "Ravi Kumar",
      stationName: "Highway 44",
      phone: "+91 98480 11223",
      address: "NH-44",
      pin: "1357",
    });
    // The raw PIN exists only here, alongside the username to hand over.
    expect(view.current.credentials).toEqual({
      username: "ravi.k",
      pin: "1357",
      subject: "Ravi Kumar",
    });
    expect(view.current.form).toEqual(BLANK);
    expect(api.listOwners).toHaveBeenCalledTimes(2);
    expect(view.current.busy).toBe(false);
  });

  it("keeps the typed form and shows no credentials when creation fails", async () => {
    api.createOwner.mockRejectedValue(new Error("Phone already registered"));
    const view = await mountHook();
    await apply(() => view.current.setForm(FILLED));
    await apply(() => view.current.submit(preventDefault()));

    expect(view.current.error).toBe("Phone already registered");
    expect(view.current.credentials).toBeNull();
    expect(view.current.form.ownerName).toBe(" Ravi Kumar ");
    expect(view.current.busy).toBe(false);
  });

  it("updates a single field through the change handler", async () => {
    const view = await mountHook();
    await apply(() => view.current.set("ownerName")({ target: { value: "Asha" } }));

    expect(view.current.form.ownerName).toBe("Asha");
    expect(view.current.form.stationName).toBe("");
  });
});
