// @vitest-environment jsdom
/**
 * The deployed site lives at https://<user>.github.io/gas_station/, so the
 * router is mounted with `basename={import.meta.env.BASE_URL}` in main.jsx.
 * If a router upgrade ever changed how a basename is stripped from the
 * incoming URL or prepended to generated hrefs, every route on the deployed
 * site would break while every MemoryRouter-based test kept passing — the
 * smoke tests mount at "/" and would not notice.
 *
 * This pins the three things that matter under a subpath deployment:
 *   1. a deep link inside the basename resolves to the right screen,
 *   2. generated hrefs carry the basename exactly once,
 *   3. navigating writes a URL that still sits under the basename.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./state/ThemeContext";
import { LanguageProvider } from "./state/LanguageContext.jsx";

const BASE = "/gas_station/";

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

const OWNER = { uid: "u-owner", role: "owner", name: "Owner", username: "owner" };

let container = null;
let root = null;

/** Mount the real app under the Pages basename at `path` (basename excluded). */
async function bootUnderBase(path, profile) {
  auth.profile = profile;
  window.history.pushState({}, "", `${BASE}${path.replace(/^\//, "")}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <BrowserRouter basename={BASE}>
        <ThemeProvider>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </ThemeProvider>
      </BrowserRouter>
    );
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (container.querySelector(".login-card, .screen-head h1, .screen-head h2")) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

beforeEach(() => {
  window.history.pushState({}, "", "/");
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

describe("the GitHub Pages subpath deployment", () => {
  it("resolves a deep link that sits under the basename", async () => {
    await bootUnderBase("/owner/shifts", OWNER);
    const head = container.querySelector(".screen-head h1, .screen-head h2");
    expect(head, "screen header rendered").toBeTruthy();
  });

  it("prefixes generated hrefs with the basename exactly once", async () => {
    await bootUnderBase("/owner", OWNER);
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs.length, "the shell rendered navigation").toBeGreaterThan(0);
    for (const href of hrefs) {
      if (href.startsWith("http") || href.startsWith("#")) continue;
      expect(href, `${href} starts at the deployment root`).toMatch(/^\/gas_station\//);
      expect(href, `${href} is not double-prefixed`).not.toMatch(
        /^\/gas_station\/gas_station\//
      );
    }
  });

  it("keeps navigations inside the basename", async () => {
    await bootUnderBase("/owner", OWNER);
    const link = [...container.querySelectorAll("a[href]")].find((a) =>
      a.getAttribute("href").endsWith("/owner/shifts")
    );
    expect(link, "a link to the shifts list rendered").toBeTruthy();
    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(window.location.pathname).toBe("/gas_station/owner/shifts");
  });
});
