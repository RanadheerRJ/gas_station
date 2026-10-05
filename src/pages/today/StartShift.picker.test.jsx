// @vitest-environment jsdom
/**
 * The nozzle picker, driven the way a thumb does.
 *
 * Starting a shift is the first thing an attendant does on this app, so the
 * picker has to be unambiguous under pressure: a taken nozzle says so in
 * words (and never names who took it), a chosen nozzle is visibly chosen,
 * and the sticky bar counts the basket before the one big button fires the
 * same open_shift call as always.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import StartShift from "./StartShift.jsx";

const api = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listPumps: vi.fn(),
  listNozzleOccupancy: vi.fn(),
  openShift: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listShifts: api.listShifts,
    listPumps: api.listPumps,
    listNozzleOccupancy: api.listNozzleOccupancy,
    openShift: api.openShift,
    readableError: (error) => String(error?.message || error),
  };
});

vi.mock("../../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: { uid: "u-att", role: "attendant", name: "Ravi" } }),
}));

vi.mock("../../state/useStation.js", () => ({
  useStation: () => ({
    station: { name: "City Centre" },
    stationId: "s1",
    loading: false,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PUMPS = [{ id: "p1", name: "Pump 1" }];
const NOZZLES = [
  { id: "n1", pumpId: "p1", name: "N1", fuelType: "MS", lastReading: "1000" },
  { id: "n2", pumpId: "p1", name: "N2", fuelType: "Diesel", lastReading: "2000" },
  { id: "n3", pumpId: "p1", name: "N3", fuelType: "HSD", lastReading: "3000" },
];

let container = null;
let root = null;

async function settle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountStart() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={["/today/start"]}>
        <LanguageProvider>
          <Routes>
            <Route path="/today/start" element={<StartShift />} />
            <Route path="/today" element={<div data-testid="today-home" />} />
            <Route path="/today/shift/:id" element={<div data-testid="run" />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
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

function tileByNozzleName(name) {
  return [...container.querySelectorAll(".nozzle-row")].find((tile) =>
    tile.textContent.includes(name)
  );
}

function startButton() {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent.trim().startsWith("Start shift on")
  );
}

beforeEach(() => {
  api.listShifts.mockResolvedValue([]);
  api.listPumps.mockResolvedValue({ pumps: PUMPS, nozzles: NOZZLES });
  api.listNozzleOccupancy.mockResolvedValue(["n3"]);
  api.openShift.mockResolvedValue({ shiftId: "sh-new" });
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

describe("the nozzle picker", () => {
  it("disables a busy tile but says so in words, naming nobody", async () => {
    await mountStart();

    const busyTile = tileByNozzleName("N3");
    expect(busyTile).toBeTruthy();
    expect(busyTile.disabled).toBe(true);
    expect(busyTile.textContent).toContain("Busy");
    // The anonymous wording — never a co-worker's name.
    expect(busyTile.textContent).toContain("Another operator");

    const freeTile = tileByNozzleName("N1");
    expect(freeTile.disabled).toBe(false);
    expect(freeTile.textContent).toContain("Free");
    // The opening reading the shift will start from, stated up front.
    expect(freeTile.textContent).toContain("1,000.00");
  });

  it("labels each fuel with its name, not only a colour", async () => {
    await mountStart();

    const tags = [...container.querySelectorAll(".fuel-tag")];
    expect(tags.map((tag) => tag.textContent)).toEqual(["MS", "Diesel", "HSD"]);
    // MS joins the petrol family's colour, HSD the diesel family's.
    expect(tags[0].className).toContain("fuel-tag--petrol");
    expect(tags[2].className).toContain("fuel-tag--diesel");
  });

  it("keeps a running count in the sticky bar and gates Start on it", async () => {
    await mountStart();

    const count = container.querySelector(".action-bar__count");
    expect(count.textContent).toContain("0 selected");
    expect(startButton().disabled).toBe(true);

    await click(tileByNozzleName("N1"));
    expect(count.textContent).toContain("1 selected");
    expect(startButton().disabled).toBe(false);

    await click(tileByNozzleName("N2"));
    expect(count.textContent).toContain("2 selected");
    expect(startButton().textContent).toContain("2");
  });

  it("marks a chosen tile with a strong state and a check", async () => {
    await mountStart();
    const tile = tileByNozzleName("N1");

    await click(tile);
    expect(tile.className).toContain("selected");
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(tile.querySelector("svg")).toBeTruthy();

    await click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("false");
  });

  it("sends the same open_shift payload as before", async () => {
    await mountStart();
    await click(tileByNozzleName("N1"));
    await click(tileByNozzleName("N2"));
    await click(startButton());
    await settle();

    expect(api.openShift).toHaveBeenCalledTimes(1);
    expect(api.openShift).toHaveBeenCalledWith("s1", {
      employeeName: "Ravi",
      nozzleIds: ["n1", "n2"],
    });
    expect(container.querySelector('[data-testid="run"]')).toBeTruthy();
  });
});
