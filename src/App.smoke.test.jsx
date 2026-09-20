// @vitest-environment jsdom
/**
 * Boot smoke test: mount the real App — real router, layout, screens and
 * data plumbing — for every role on every top-level route.
 *
 * The auth hook is the only thing faked. There are no Supabase credentials
 * in the test environment, so every data load honestly fails and each screen
 * settles into its loading, error or empty state. That is exactly what this
 * pins down: a screen that crashes on boot, a route that no longer resolves,
 * or a role landing somewhere unexpected fails here, in CI, long before it
 * reaches a phone at a forecourt counter.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./state/ThemeContext";
import { LanguageProvider } from "./state/LanguageContext.jsx";

/* The signed-in account, swapped per case. Hoisted so the vi.mock factory
 * (which runs before this module's body) can close over it safely. */
const auth = vi.hoisted(() => ({ profile: null }));

vi.mock("./state/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: () => ({
      profile: auth.profile,
      loading: false,
      isAdmin: auth.profile?.role === "admin",
      isOwner: auth.profile?.role === "owner",
      isManager: auth.profile?.role === "manager",
      isAttendant: auth.profile?.role === "attendant",
      canAmend: ["owner", "manager"].includes(auth.profile?.role),
      login: () => {},
      developerLogin: () => {},
      logout: () => {},
    }),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PROFILES = {
  admin: { uid: "u-admin", role: "admin", name: "Admin", username: "admin" },
  owner: { uid: "u-owner", role: "owner", name: "Owner", username: "owner" },
  manager: {
    uid: "u-manager",
    role: "manager",
    name: "Manager",
    username: "manager",
    stationId: "s1",
    stationIds: ["s1"],
  },
  attendant: {
    uid: "u-attendant",
    role: "attendant",
    name: "Ravi",
    username: "ravi",
    stationId: "s1",
    stationIds: ["s1"],
  },
};

let container = null;
let root = null;

/** Render the app at `route` signed in as `profile`, and let it settle. */
async function boot(route, profile) {
  auth.profile = profile;
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  });
  // Let in-flight loads fail and their error/empty states render. A crashed
  // screen unmounts the tree, so the marker assertion below is the verdict.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function expectScreen() {
  const head = container.querySelector(".screen-head h1, .screen-head h2");
  expect(head, "screen header rendered").toBeTruthy();
  expect(head.textContent.trim()).not.toBe("");
}

function expectLogin() {
  expect(container.querySelector(".login-card"), "login card rendered").toBeTruthy();
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  auth.profile = null;
});

describe("the app boots for every role", () => {
  it("shows the login card when signed out, whatever the URL", async () => {
    await boot("/owner/stock", null);
    expectLogin();
  });

  it("redirects a signed-in user away from /login to their home", async () => {
    await boot("/login", PROFILES.attendant);
    expectScreen();
  });

  const cases = [
    ["admin invites owners", "admin", "/admin"],
    ["owner overview", "owner", "/owner"],
    ["owner shifts", "owner", "/owner/shifts"],
    ["owner start shift", "owner", "/owner/shifts/start"],
    ["owner setup", "owner", "/owner/setup"],
    ["owner stock", "owner", "/owner/stock"],
    ["owner ledger", "owner", "/owner/ledger"],
    ["owner credit", "owner", "/owner/credit"],
    ["owner staff", "owner", "/owner/staff"],
    ["manager shifts", "manager", "/station"],
    ["manager start shift", "manager", "/station/start"],
    ["manager stock", "manager", "/station/stock"],
    ["manager ledger", "manager", "/station/ledger"],
    ["manager credit", "manager", "/station/credit"],
    ["manager staff", "manager", "/station/staff"],
    ["attendant today", "attendant", "/today"],
    ["attendant start shift", "attendant", "/today/start"],
    ["attendant history", "attendant", "/today/history"],
    ["attendant account", "attendant", "/today/account"],
  ];

  it.each(cases)("%s (%s at %s)", async (_label, role, route) => {
    await boot(route, PROFILES[role]);
    expectScreen();
  });
});

describe("detail routes degrade honestly without data", () => {
  const cases = [
    ["missing shift", "owner", "/owner/shifts/nope"],
    ["missing tank", "owner", "/owner/stock/nope"],
    ["missing customer", "owner", "/owner/credit/nope"],
    ["empty ledger day", "owner", "/owner/ledger/2026-09-19"],
    ["missing manager shift", "manager", "/station/shift/nope"],
    ["missing attendant shift", "attendant", "/today/shift/nope"],
  ];

  it.each(cases)("%s (%s at %s)", async (_label, role, route) => {
    await boot(route, PROFILES[role]);
    // Some render a screen header; others redirect home — both are fine.
    // The only failure mode this test knows is a crashed tree.
    expect(
      container.children.length,
      "rendered something without crashing"
    ).toBeGreaterThan(0);
  });
});

describe("back buttons leave the screen they are on", () => {
  const cases = [
    ["owner shift detail", "owner", "/owner/shifts/nope"],
    ["owner tank detail", "owner", "/owner/stock/nope"],
    ["owner ledger day", "owner", "/owner/ledger/2026-09-19"],
    ["owner customer detail", "owner", "/owner/credit/nope"],
    ["manager shift detail", "manager", "/station/shift/nope"],
    ["manager tank detail", "manager", "/station/stock/nope"],
    ["manager ledger day", "manager", "/station/ledger/2026-09-20"],
    ["manager customer detail", "manager", "/station/credit/nope"],
    ["attendant running shift", "attendant", "/today/shift/nope"],
    ["attendant tank detail", "attendant", "/today/stock/nope"],
    ["attendant past shift", "attendant", "/today/history/nope"],
  ];

  it.each(cases)("%s (%s at %s)", async (_label, role, route) => {
    await boot(route, PROFILES[role]);
    const back = container.querySelector(".back-link");
    expect(back, "back button rendered").toBeTruthy();
    // The failure this guards against is silent: a Link whose `to` resolves
    // to the current location renders as a back button that goes nowhere,
    // so its href would be the very route we are already on.
    expect(back.getAttribute("href"), "back button points elsewhere").not.toBe(route);

    // And it really leaves: tapping it lands on the parent list screen,
    // which renders a header of its own and no back button.
    await act(async () => {
      back.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector(".back-link"), "left the detail").toBeNull();
    expectScreen();
  });
});
