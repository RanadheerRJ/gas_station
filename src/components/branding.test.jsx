// @vitest-environment jsdom
/**
 * The brand artwork is UI, not decoration: it is the only thing naming the
 * app on the login and boot screens, it must size itself from one number,
 * and the boot animation is keyed off class names the stylesheet expects.
 * These tests pin all three contracts so a redesign cannot quietly break
 * the header, the a11y tree, or the loading choreography.
 */

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PetravBoot, PetravLockup, PetravMark, PetravWordmark } from "./branding.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
  return { container, root };
}

describe("PetravMark", () => {
  it("carries an accessible name when it is the brand on screen", () => {
    const { container } = render(<PetravMark label="PÉTRAV" />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("PÉTRAV");
    expect(svg.querySelector("title").textContent).toBe("PÉTRAV");
  });

  it("is decorative (and hidden from assistive tech) without a label", () => {
    const { container } = render(<PetravMark />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBe(null);
  });

  it("draws the full concept: pump, ₹, drop, nozzle and clock", () => {
    const { container } = render(<PetravMark />);
    // pump body, display, nozzle handle and clock face as shapes…
    expect(container.querySelectorAll("rect").length).toBe(4);
    expect(container.querySelectorAll("circle").length).toBe(2);
    // …and the rupee, drop, hose, nozzle spout, ticks and hands as paths.
    expect(container.querySelectorAll("path").length).toBe(7);
  });

  it("exposes the animation hooks the boot choreography is keyed on", () => {
    const { container } = render(<PetravMark />);
    for (const hook of ["pm-pump", "pm-clock", "pm-rupee", "pm-drop", "pm-hand"]) {
      expect(
        container.querySelector(`.${hook}`),
        `expected an element with class ${hook}`
      ).toBeTruthy();
    }
  });
});

describe("PetravWordmark", () => {
  it("sizes from the height alone, at the artwork's aspect ratio", () => {
    const { container } = render(<PetravWordmark height={20} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("height")).toBe("20");
    expect(Number(svg.getAttribute("width"))).toBe(Math.round(20 * (301.5 / 80.5)));
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the A's crossbar red, and only in colour mode", () => {
    const colour = render(<PetravWordmark />).container.querySelectorAll("path");
    const mono = render(<PetravWordmark mono />).container.querySelectorAll("path");
    // The last path is the crossbar.
    expect(colour[2].getAttribute("stroke")).toBe("var(--petrav-red, #E31B23)");
    expect(mono[2].getAttribute("stroke")).toBe("currentColor");
  });
});

describe("PetravLockup", () => {
  it("names the brand once; its parts stay decorative", () => {
    const { container } = render(<PetravLockup />);
    const lockup = container.querySelector(".brand-lockup");
    expect(lockup.getAttribute("role")).toBe("img");
    expect(lockup.getAttribute("aria-label")).toBe("PÉTRAV");
    const svgs = lockup.querySelectorAll("svg");
    expect(svgs.length).toBe(2);
    expect([...svgs].every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("PetravBoot", () => {
  it("announces itself as a busy status with the subtitle and a loading note", () => {
    const { container } = render(
      <LanguageProvider>
        <PetravBoot />
      </LanguageProvider>
    );
    const boot = container.querySelector(".boot");
    expect(boot.getAttribute("role")).toBe("status");
    expect(boot.getAttribute("aria-busy")).toBe("true");
    expect(boot.querySelector(".boot__sub").textContent).toBe("Station Management");
    expect(boot.querySelector(".boot__loading").textContent).toContain("Loading");
    expect(boot.querySelector(".boot__mark")).toBeTruthy();
  });
});
