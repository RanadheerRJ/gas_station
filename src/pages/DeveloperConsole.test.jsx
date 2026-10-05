// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DeveloperConsole from "./DeveloperConsole.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import * as api from "../lib/api.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OWNERS = [
  { uid: "o-1", name: "Ravi Kumar", username: "ravikumar", phone: "9848011223" },
  { uid: "o-2", name: "Asha Reddy", username: "ashareddy", phone: "" },
];

const REGISTRY = [
  {
    stationId: "st-1",
    name: "Highway 44 Fuel",
    address: "NH-44, Shamirpet",
    state: "active",
    ownerId: "o-1",
    ownerName: "Ravi Kumar",
    ownerUsername: "ravikumar",
    staffCount: 2,
  },
  {
    stationId: "st-2",
    name: "Lake View Petroleum",
    address: "Tank Bund Road",
    state: "archived",
    ownerId: "o-2",
    ownerName: "Asha Reddy",
    ownerUsername: "ashareddy",
    staffCount: 0,
  },
];

const STAFF = [
  {
    uid: "u-1",
    name: "Mahesh Rao",
    username: "mahesh",
    role: "manager",
    phone: "",
    stationIds: ["st-1"],
  },
];

let container = null;
let root = null;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <DeveloperConsole />
        </LanguageProvider>
      </MemoryRouter>
    );
  });
}

/** The first button under `scope` whose visible text matches. */
function button(text, scope) {
  return Array.from((scope || container).querySelectorAll("button")).find((b) =>
    b.textContent.trim().toLowerCase().includes(text.toLowerCase())
  );
}

/** The sheet currently on screen (sheets animate out, so take the last). */
function sheet() {
  const all = document.body.querySelectorAll(".sheet-root:not(.closing) .sheet");
  return all[all.length - 1] || null;
}

const sheetButton = (text) => button(text, sheet());

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Let a closing sheet finish leaving the DOM. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260));
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

beforeEach(() => {
  vi.spyOn(api, "listOwners").mockResolvedValue(OWNERS);
  vi.spyOn(api, "adminStationRegistry").mockResolvedValue(REGISTRY);
  vi.spyOn(api, "listOwnerStaff").mockResolvedValue(STAFF);
});

afterEach(() => {
  if (root) {
    act(() => root.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
});

describe("DeveloperConsole", () => {
  it("opens on the owners list with the platform totals", async () => {
    await render();

    const text = container.textContent;
    expect(text).toContain("Developer console");
    expect(text).toContain("Ravi Kumar");
    expect(text).toContain("Asha Reddy");
    // Two owners, two stations, one of them active.
    const stats = Array.from(container.querySelectorAll(".stat")).map((s) =>
      s.textContent.replace(/\s+/g, " ").trim()
    );
    expect(stats.join(" | ")).toMatch(/Owners\s*2/);
    expect(stats.join(" | ")).toMatch(/Stations\s*2/);
  });

  it("counts each owner's stations on their card", async () => {
    await render();
    const cards = Array.from(container.querySelectorAll(".dev-card"));
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("1 station");
  });

  it("loads an owner's logins only when their card is expanded", async () => {
    await render();
    expect(api.listOwnerStaff).not.toHaveBeenCalled();

    await click(button("stations & logins"));

    expect(api.listOwnerStaff).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Mahesh Rao");
  });

  it("lists every station on the stations tab and filters them", async () => {
    await render();
    await click(button("Stations"));

    const rows = () => container.querySelectorAll("tbody tr");
    expect(rows()).toHaveLength(2);
    expect(container.textContent).toContain("Lake View Petroleum");

    await click(button("Archived"));
    expect(rows()).toHaveLength(1);
    expect(container.querySelector("tbody").textContent).toContain("Lake View");

    const search = container.querySelector('input[type="search"]');
    await act(async () => changeInput(search, "highway"));
    expect(container.querySelector(".dev-empty")).toBeTruthy();
  });

  it("deletes a station end to end, then re-reads the registry", async () => {
    const del = vi.spyOn(api, "deleteStation").mockResolvedValue({
      ok: true,
      name: "Highway 44 Fuel",
    });
    await render();
    await click(button("Stations"));
    await click(button("Manage"));

    // The station sheet carries the whole lifecycle, including the delete.
    expect(sheet().querySelector(".sheet__head h2").textContent).toContain(
      "Highway 44 Fuel"
    );

    await click(sheetButton("Delete station"));
    await settle();

    await act(async () => changeInput(sheet().querySelector("input"), "Highway 44 Fuel"));
    await click(sheetButton("Delete this station"));
    await settle();

    expect(del).toHaveBeenCalledWith("st-1");
    // The list is re-read, and the console says what went.
    expect(api.adminStationRegistry).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Highway 44 Fuel");
    expect(container.querySelector(".notice.good")?.textContent).toContain("deleted");
    expect(sheet()).toBeNull();
  });

  it("keeps the delete sheet open and shows why when the server refuses", async () => {
    vi.spyOn(api, "deleteStation").mockRejectedValue(
      new Error("A shift is still open at this station.")
    );
    await render();
    await click(button("Stations"));
    await click(button("Manage"));
    await click(sheetButton("Delete station"));
    await settle();

    await act(async () => changeInput(sheet().querySelector("input"), "Highway 44 Fuel"));
    await click(sheetButton("Delete this station"));

    expect(sheet()).toBeTruthy();
    expect(document.body.textContent).toContain("A shift is still open at this station.");
  });

  it("creates a station for an owner from the stations tab", async () => {
    const create = vi.spyOn(api, "adminCreateStation").mockResolvedValue({});
    await render();
    await click(button("Stations"));
    await click(button("New station"));

    const inputs = sheet().querySelectorAll("form input");
    await act(async () => changeInput(inputs[0], "Green Valley Fuels"));
    await act(async () => changeInput(inputs[1], "Bypass Road, Warangal"));
    await click(sheetButton("Create station"));

    expect(create).toHaveBeenCalledWith({
      name: "Green Valley Fuels",
      address: "Bypass Road, Warangal",
      ownerId: "o-1",
    });
    expect(container.querySelector(".notice.good")?.textContent).toContain("created");
  });

  it("archives a station from its sheet", async () => {
    const setState = vi.spyOn(api, "adminSetStationState").mockResolvedValue({});
    await render();
    await click(button("Stations"));
    await click(button("Manage"));
    await click(sheetButton("Archive"));

    expect(setState).toHaveBeenCalledWith("st-1", "archived");
  });

  it("corrects an owner's name", async () => {
    const update = vi.spyOn(api, "adminUpdateProfile").mockResolvedValue({});
    await render();
    await click(button("Edit"));

    const inputs = sheet().querySelectorAll("form input");
    await act(async () => changeInput(inputs[0], "Ravi Kumar Reddy"));
    await click(sheetButton("Save"));

    expect(update).toHaveBeenCalledWith("o-1", {
      name: "Ravi Kumar Reddy",
      phone: "9848011223",
    });
  });

  it("says so rather than showing zero when the registry cannot be read", async () => {
    api.adminStationRegistry.mockRejectedValue(new Error("missing function"));
    await render();

    expect(container.textContent).toContain("latest database migration");
    expect(container.textContent).toContain("stations unknown");
  });
});
