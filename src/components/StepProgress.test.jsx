// @vitest-environment jsdom
/**
 * StepProgress, pinned.
 *
 * The close-shift flow leans on this bar to answer "where am I, what is
 * left". These tests pin the three things that make it honest: completed
 * steps carry a check (not just a colour), the current step is named in
 * words with its number, and the all-done state says so instead of
 * silently highlighting the last dot.
 */

import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import StepProgress from "./StepProgress.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <LanguageProvider>
        <StepProgress {...props} />
      </LanguageProvider>
    );
  });
  return container;
}

const STEPS = [
  { id: "readings", label: "Closing readings", done: false },
  { id: "testing", label: "Fuel tested", done: false },
  { id: "credit", label: "Credit sales", done: false },
];

describe("StepProgress", () => {
  it("names the first unfinished step with its number and total", () => {
    const container = render({ steps: STEPS });
    expect(container.querySelector(".step-progress__label").textContent).toBe(
      "Step 1 of 3: Closing readings"
    );
    expect(container.querySelector(".step-progress").getAttribute("data-active")).toBe(
      "1"
    );
  });

  it("marks done steps with a check and the current one as current", () => {
    const container = render({
      steps: [{ ...STEPS[0], done: true }, STEPS[1], STEPS[2]],
    });
    const dots = [...container.querySelectorAll(".step-progress__dot")];
    expect(dots.map((dot) => dot.dataset.state)).toEqual(["done", "current", "todo"]);
    // The check glyph is the non-colour signal on the completed dot.
    expect(dots[0].querySelector("svg")).toBeTruthy();
    expect(dots[1].querySelector("svg")).toBeNull();
    expect(container.querySelector(".step-progress__label").textContent).toBe(
      "Step 2 of 3: Fuel tested"
    );
  });

  it("says ready to send once every step is done", () => {
    const container = render({
      steps: STEPS.map((step) => ({ ...step, done: true })),
    });
    const root = container.querySelector(".step-progress");
    expect(root.dataset.complete).toBe("true");
    expect(container.querySelector(".step-progress__label").textContent).toBe(
      "All steps filled — check the summary and send"
    );
  });

  it("exposes the whole label to assistive tech and hides the dots", () => {
    const container = render({ steps: STEPS });
    const bar = container.querySelector(".step-progress");
    expect(bar.getAttribute("role")).toBe("group");
    expect(bar.getAttribute("aria-label")).toBe("Step 1 of 3: Closing readings");
    expect(
      container.querySelector(".step-progress__dots").getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("keeps a single step from claiming to be part of a journey", () => {
    const container = render({ steps: [{ ...STEPS[0], done: false }] });
    expect(container.querySelector(".step-progress__label").textContent).toBe(
      "Step 1 of 1: Closing readings"
    );
  });
});
