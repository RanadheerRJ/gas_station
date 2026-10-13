// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Layout, { destinationsFor } from "./Layout.jsx";
import { ThemeProvider } from "../state/ThemeContext.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

const auth = vi.hoisted(() => ({ profile: null }));
const stationsMock = vi.hoisted(() => ({ list: [] }));

vi.mock("../state/AuthContext", () => ({
  useAuth: () => ({
    profile: auth.profile,
    loading: false,
    isAdmin: auth.profile?.role === "admin",
    isOwner: auth.profile?.role === "owner",
    isManager: auth.profile?.role === "manager",
    isAttendant: auth.profile?.role === "attendant",
    login: () => {},
    logout: () => {},
  }),
}));

// The shell reads the station list itself now (the switcher), so the hook is
// stubbed with a controllable list instead of hitting Supabase.
vi.mock("../state/useStations", () => ({
  useStations: () => ({
    stations: stationsMock.list,
    loading: false,
    error: "",
    reload: async () => {},
    setStations: () => {},
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The router's current location, captured on every render. */
const lastLocation = { current: null };
function LocationProbe() {
  lastLocation.current = useLocation();
  return null;
}

describe("destinationsFor", () => {
  it("returns owner destinations in proper order: Overview, Shifts, Ground Stock, Credit Customers, and others", () => {
    const { tabs, more } = destinationsFor("owner");

    expect(tabs.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/owner", label: "nav.overview" },
      { to: "/owner/shifts", label: "nav.shifts" },
      { to: "/owner/stock", label: "nav.groundStock" },
      { to: "/owner/credit", label: "nav.creditCustomers" },
    ]);

    expect(more.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/owner/ledger", label: "nav.dailyLedger" },
      { to: "/owner/setup", label: "nav.pumpsRates" },
      { to: "/owner/staff", label: "nav.staffAccess" },
      { to: "/owner/reports", label: "nav.reports" },
    ]);
  });

  it("returns manager destinations with Shifts, Credit Customers, Ground Stock, Daily Ledger and others", () => {
    const { tabs, more } = destinationsFor("manager");

    expect(tabs.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/station", label: "nav.shifts" },
      { to: "/station/credit", label: "nav.creditCustomers" },
      { to: "/station/stock", label: "nav.groundStock" },
      { to: "/station/ledger", label: "nav.dailyLedger" },
    ]);

    expect(more.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/station/staff", label: "nav.staffAccess" },
      { to: "/station/reports", label: "nav.reports" },
    ]);
  });

  it("returns attendant destinations with Today, Credit Customers, Ground Stock, History, and Account", () => {
    const { tabs, more } = destinationsFor("attendant");

    expect(tabs.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/today", label: "nav.today" },
      { to: "/today/credit", label: "nav.creditCustomers" },
      { to: "/today/stock", label: "nav.groundStock" },
      { to: "/today/history", label: "nav.history" },
    ]);

    expect(more.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/today/account", label: "nav.account" },
    ]);
  });

  it("returns empty tabs and more for unknown or admin roles", () => {
    expect(destinationsFor("admin")).toEqual({ tabs: [], more: [] });
    expect(destinationsFor(undefined)).toEqual({ tabs: [], more: [] });
  });
});

describe("Layout bottom navigation and Others sheet", () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    stationsMock.list = [];
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    auth.profile = null;
    lastLocation.current = null;
  });

  async function renderLayout(profile, route = "/owner") {
    auth.profile = profile;
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter initialEntries={[route]}>
          <LocationProbe />
          <ThemeProvider>
            <LanguageProvider>
              <Layout />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );
    });
  }

  it("renders owner bottom buttons in proper order and opens Others sheet", async () => {
    await renderLayout({
      uid: "u-owner",
      role: "owner",
      name: "Owner User",
      username: "owner",
    });

    const tabbar = container.querySelector(".tabbar");
    expect(tabbar).toBeTruthy();

    const tabLinks = Array.from(tabbar.querySelectorAll(".tab"));
    expect(tabLinks.length).toBe(5);

    const tabTexts = tabLinks.map((t) => t.textContent.trim());
    expect(tabTexts).toEqual(["Overview", "Shifts", "Stock", "Credit", "Others"]);

    expect(tabLinks.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Overview",
      "Shifts",
      "Ground stock",
      "Credit customers",
      "Others",
    ]);

    // The active destination is marked for assistive tech, and carries the
    // pill treatment behind its glyph.
    expect(tabLinks[0].getAttribute("aria-current")).toBe("page");
    expect(tabLinks[0].querySelector(".tab__glyph")).toBeTruthy();
    expect(tabLinks[4].getAttribute("aria-expanded")).toBe("false");

    // Check that clicking the "Others" tab opens the sheet with overflow destinations
    const othersButton = tabLinks[4];
    await act(async () => {
      othersButton.click();
    });

    const sheet = document.body.querySelector(".sheet");
    expect(sheet).toBeTruthy();
    expect(sheet.querySelector("h2")?.textContent.trim()).toBe("Others");

    const tiles = Array.from(sheet.querySelectorAll(".more-tile"));
    const tileTexts = tiles.map((item) => item.textContent.trim());
    expect(tileTexts).toEqual([
      "Daily ledger",
      "Pumps & rates",
      "Staff & access",
      "Reports",
      "Account",
      "Language",
      "Dark mode",
      "Sign out",
    ]);

    // Destination tiles navigate; preferences tiles act. Both are real
    // controls — links for routes, buttons for sheets and actions.
    expect(tiles[0].tagName).toBe("A");
    expect(tiles[4].tagName).toBe("BUTTON");
    expect(tiles[7].classList).toContain("more-tile--danger");
  });

  it("navigates from a More tile, and the sheet closes behind it", async () => {
    await renderLayout({
      uid: "u-owner",
      role: "owner",
      name: "Owner User",
      username: "owner",
    });

    await act(async () => {
      container.querySelector(".tabbar .tab:last-child").click();
    });
    const ledgerTile = Array.from(document.body.querySelectorAll(".more-tile")).find(
      (tile) => tile.textContent.includes("Daily ledger")
    );
    expect(ledgerTile).toBeTruthy();

    await act(async () => {
      ledgerTile.click();
    });
    expect(lastLocation.current.pathname).toBe("/owner/ledger");

    // The sheet animates out over ~200ms, then leaves the DOM.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(document.body.querySelector(".sheet")).toBeNull();
  });

  it("swaps the More sheet to the language choices and back", async () => {
    await renderLayout({
      uid: "u-owner",
      role: "owner",
      name: "Owner User",
      username: "owner",
    });

    await act(async () => {
      container.querySelector(".tabbar .tab:last-child").click();
    });
    const languageTile = Array.from(document.body.querySelectorAll(".more-tile")).find(
      (tile) => tile.textContent.trim() === "Language"
    );
    await act(async () => {
      languageTile.click();
    });

    const sheet = document.body.querySelector(".sheet");
    expect(sheet.querySelector("h2").textContent.trim()).toBe("Language");
    const options = Array.from(sheet.querySelectorAll(".lang-options .chip"));
    expect(options.map((o) => o.textContent.trim())).toEqual([
      "English",
      "తెలుగు",
      "हिंदी",
    ]);
    expect(options[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("uses short manager tab labels without losing full accessible names", async () => {
    await renderLayout({
      uid: "u-manager",
      role: "manager",
      name: "Manager User",
      username: "manager",
    });

    const tabbar = container.querySelector(".tabbar");
    expect(tabbar).toBeTruthy();

    const tabLinks = Array.from(tabbar.querySelectorAll(".tab"));
    expect(tabLinks.map((t) => t.textContent.trim())).toEqual([
      "Shifts",
      "Credit",
      "Stock",
      "Ledger",
      "Others",
    ]);
    expect(tabLinks.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Shifts",
      "Credit customers",
      "Ground stock",
      "Daily ledger",
      "Others",
    ]);
  });
});

describe("the station switcher", () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    auth.profile = null;
    lastLocation.current = null;
    stationsMock.list = [];
  });

  async function renderLayout(profile, route) {
    auth.profile = profile;
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter initialEntries={[route]}>
          <LocationProbe />
          <ThemeProvider>
            <LanguageProvider>
              <Layout />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );
    });
  }

  it("shows the current station as a pill that switches the ?station= filter", async () => {
    stationsMock.list = [
      { id: "s1", name: "Station One" },
      { id: "s2", name: "Station Two" },
    ];
    await renderLayout(
      { uid: "u-owner", role: "owner", name: "Owner User", username: "owner" },
      "/owner/shifts?station=s1"
    );

    const pill = container.querySelector(".appbar__station");
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain("Station One");

    await act(async () => {
      pill.click();
    });

    const sheet = document.body.querySelector(".sheet");
    expect(sheet.querySelector("h2").textContent.trim()).toBe("Switch station");
    const rows = Array.from(sheet.querySelectorAll(".list-row"));
    expect(rows).toHaveLength(2);
    // The current station is checked, and says so for assistive tech.
    expect(rows[0].getAttribute("aria-current")).toBe("true");
    expect(rows[0].querySelector(".station-sheet__check")).toBeTruthy();
    expect(rows[1].getAttribute("aria-current")).toBeNull();

    await act(async () => {
      rows[1].click();
    });
    expect(lastLocation.current.search).toBe("?station=s2");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(document.body.querySelector(".sheet")).toBeNull();
  });

  it("shows a single-station attendant their station as a plain label, not a control", async () => {
    stationsMock.list = [{ id: "s1", name: "Sri Balaji Fuels" }];
    await renderLayout(
      { uid: "u-att", role: "attendant", name: "Ravi", username: "ravi" },
      "/today"
    );

    const label = container.querySelector(".appbar__station--static");
    expect(label).toBeTruthy();
    expect(label.textContent).toContain("Sri Balaji Fuels");
    // Nothing in the top bar opens a station sheet for an attendant.
    expect(container.querySelector("button.appbar__station")).toBeNull();
  });

  it("keeps the brand in the top bar for an owner with one station", async () => {
    stationsMock.list = [{ id: "s1", name: "Station One" }];
    await renderLayout(
      { uid: "u-owner", role: "owner", name: "Owner User", username: "owner" },
      "/owner"
    );
    expect(container.querySelector(".appbar__station")).toBeNull();
    expect(container.querySelector(".appbar .brand-lockup")).toBeTruthy();
  });
});

describe("scroll behaviour between screens", () => {
  let container = null;
  let root = null;

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    auth.profile = null;
  });

  /** The shell with two tall screens routed, so .main really scrolls. */
  async function renderShell(route) {
    const div = document.createElement("div");
    document.body.appendChild(div);
    container = div;
    auth.profile = { uid: "u-owner", role: "owner", name: "Owner", username: "owner" };
    await act(async () => {
      root = createRoot(div);
      root.render(
        <MemoryRouter initialEntries={[route]}>
          <ThemeProvider>
            <LanguageProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route
                    path="/owner"
                    element={<div style={{ height: 3000 }}>home</div>}
                  />
                  <Route
                    path="/owner/shifts"
                    element={<div style={{ height: 3000 }}>shifts</div>}
                  />
                </Route>
              </Routes>
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );
    });
  }

  function main() {
    return container.querySelector(".main");
  }

  it("starts a forward navigation at the top and restores the position on back", async () => {
    await renderShell("/owner");
    main().scrollTop = 500;

    const shiftsTab = Array.from(container.querySelectorAll(".tabbar .tab")).find((tab) =>
      tab.textContent.includes("Shifts")
    );
    await act(async () => {
      shiftsTab.click();
    });
    // Going deeper into the app starts the new screen at the top.
    expect(main().scrollTop).toBe(0);

    main().scrollTop = 300;
    const homeTab = Array.from(container.querySelectorAll(".tabbar .tab")).find((tab) =>
      tab.textContent.includes("Overview")
    );
    await act(async () => {
      homeTab.click();
    });
    // Coming back returns the list to where it was left.
    expect(main().scrollTop).toBe(500);
  });
});
