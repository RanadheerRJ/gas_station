// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Layout, { destinationsFor } from "./Layout.jsx";
import { ThemeProvider } from "../state/ThemeContext.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

const auth = vi.hoisted(() => ({ profile: null }));

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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("destinationsFor", () => {
  it("returns owner destinations in proper order: Overview, Shifts, Credit Customers, Ground Stock, and others", () => {
    const { tabs, more } = destinationsFor("owner");

    expect(tabs.map((t) => ({ to: t.to, label: t.label }))).toEqual([
      { to: "/owner", label: "nav.overview" },
      { to: "/owner/shifts", label: "nav.shifts" },
      { to: "/owner/credit", label: "nav.creditCustomers" },
      { to: "/owner/stock", label: "nav.groundStock" },
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
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    auth.profile = null;
  });

  async function renderLayout(profile, route = "/owner") {
    auth.profile = profile;
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter initialEntries={[route]}>
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
    expect(tabTexts).toEqual(["Overview", "Shifts", "Credit", "Stock", "Others"]);

    expect(tabLinks.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Overview",
      "Shifts",
      "Credit customers",
      "Ground stock",
      "Others",
    ]);

    // Check that clicking the "Others" tab opens the sheet with overflow destinations
    const othersButton = tabLinks[4];
    await act(async () => {
      othersButton.click();
    });

    const sheet = document.body.querySelector(".sheet");
    expect(sheet).toBeTruthy();
    expect(sheet.querySelector("h2")?.textContent.trim()).toBe("Others");

    const moreItems = Array.from(sheet.querySelectorAll(".more-list__item"));
    const moreTexts = moreItems.map((item) => item.textContent.trim());
    expect(moreTexts).toEqual([
      "Daily ledger",
      "Pumps & rates",
      "Staff & access",
      "Reports",
    ]);
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
