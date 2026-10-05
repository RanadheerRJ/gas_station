// @vitest-environment jsdom
/**
 * VariancePill, pinned.
 *
 * The pill is the one-glance answer to "did I count the cash right", so the
 * four states have to be distinguishable without colour (each carries a
 * glyph or a word) and must follow the same tolerance as the reviewer's
 * verdict, not their own rounding.
 */

import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import VariancePill from "./VariancePill.jsx";
import { VARIANCE_TOLERANCE } from "../lib/shiftMath.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(variance) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <LanguageProvider>
        <VariancePill variance={variance} />
      </LanguageProvider>
    );
  });
  return container;
}

describe("VariancePill", () => {
  it("stays quiet while nothing has been counted", () => {
    const container = render(null);
    const pill = container.querySelector(".variance-pill");
    expect(pill.className).toContain("variance-pill--quiet");
    expect(pill.textContent).toContain("Cash not counted yet");
  });

  it("matches within the shared tolerance, not just at zero", () => {
    for (const variance of [0, VARIANCE_TOLERANCE, -VARIANCE_TOLERANCE]) {
      const container = render(variance);
      const pill = container.querySelector(".variance-pill");
      expect(pill.className).toContain("variance-pill--ok");
      expect(pill.textContent).toContain("Matches");
      expect(pill.textContent).toContain("✓");
    }
  });

  it("shows the rupee amount it is short, with a downward glyph", () => {
    const container = render(-(VARIANCE_TOLERANCE + 0.01));
    const pill = container.querySelector(".variance-pill");
    expect(pill.className).toContain("variance-pill--short");
    expect(pill.textContent).toContain("Short ₹");
    expect(pill.textContent).toContain("1.01");
    expect(pill.textContent).toContain("▼");
  });

  it("shows the rupee amount it is over, with an upward glyph", () => {
    const container = render(VARIANCE_TOLERANCE + 49.5);
    const pill = container.querySelector(".variance-pill");
    expect(pill.className).toContain("variance-pill--over");
    expect(pill.textContent).toContain("Over ₹");
    expect(pill.textContent).toContain("50.50");
    expect(pill.textContent).toContain("▲");
  });
});
