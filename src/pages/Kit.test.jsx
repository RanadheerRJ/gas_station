// @vitest-environment jsdom
/**
 * The dev-only component kit, pinned.
 *
 * The page exists so a change to tokens.css or the shared components can be
 * eyeballed at /__kit in both themes. What this pins is that it still mounts
 * with every section present — a broken demo page fails here instead of
 * being discovered screen by screen — and that the theme switch is wired to
 * the real ThemeContext, which is what makes "both themes" a one-tap check.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import Kit from "./Kit.jsx";
import { ThemeProvider } from "../state/ThemeContext.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MemoryRouter>
        <ThemeProvider>
          <LanguageProvider>
            <Kit />
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  });
  return container;
}

describe("Kit page", () => {
  it("renders every foundation section", () => {
    const container = render();
    const heads = [...container.querySelectorAll(".section-label h2")].map(
      (h) => h.textContent
    );
    [
      "Buttons",
      "Chips",
      "Cards",
      "List rows",
      "Loading skeletons",
      "Empty state",
      "Segmented control",
      "Panels and figures",
      "Money figures",
      "Notices",
      "Bottom sheet",
      "Step progress",
    ].forEach((label) => expect(heads).toContain(label));

    // The restyled existing components are on the page too.
    expect(container.querySelector(".panel")).toBeTruthy();
    expect(container.querySelector(".notice")).toBeTruthy();
    expect(container.querySelector(".step-progress")).toBeTruthy();
    expect(container.querySelector(".sticky-cta")).toBeTruthy();
    expect(container.querySelector(".cta")).toBeTruthy();
    expect(container.querySelectorAll(".chip").length).toBeGreaterThan(4);
  });

  it("switches the real theme from its header control", () => {
    const container = render();
    const before = document.documentElement.dataset.theme;
    // The header control's first segment is the theme switch; press whichever
    // option is not currently selected.
    const options = [...container.querySelectorAll(".segmented button")];
    const other = options.find((b) => b.getAttribute("aria-selected") === "false");
    act(() => {
      other.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const after = document.documentElement.dataset.theme;
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});
