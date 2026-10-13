// @vitest-environment jsdom
/**
 * StickyCta, pinned.
 *
 * The checkout bar's contract: a summary on the left, one primary action on
 * the right, and a spacer that keeps the fixed bar from trapping content.
 * The action is a real button (disabled with a reason while blocked) or a
 * router Link when it navigates, and the busy state both blocks presses and
 * says so via aria-busy.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import StickyCta from "./StickyCta.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MemoryRouter>{ui}</MemoryRouter>);
  });
  return container;
}

describe("StickyCta", () => {
  it("shows the summary, hint and a pill button, plus the spacer", () => {
    const container = render(
      <StickyCta
        summary="2 nozzles · ₹ 4,120"
        hint="Pick nozzles to continue"
        ctaLabel="Start shift"
        onCta={() => {}}
      />
    );
    expect(container.querySelector(".sticky-cta__summary-main").textContent).toBe(
      "2 nozzles · ₹ 4,120"
    );
    expect(container.querySelector(".sticky-cta__hint").textContent).toBe(
      "Pick nozzles to continue"
    );
    const button = container.querySelector("button.cta.sticky-cta__btn");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Start shift");
    expect(container.querySelector(".sticky-cta__spacer")).toBeTruthy();
  });

  it("fires the action, and a disabled bar does not", () => {
    let started = 0;
    const container = render(
      <StickyCta summary="None selected" ctaLabel="Start" onCta={() => (started += 1)} />
    );
    act(() => {
      container
        .querySelector("button.cta")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(started).toBe(1);

    const blocked = render(
      <StickyCta
        summary="None selected"
        hint="Select at least one nozzle"
        ctaLabel="Start"
        onCta={() => (started += 1)}
        disabled
      />
    );
    const button = blocked.querySelector("button.cta");
    expect(button.disabled).toBe(true);
    expect(blocked.querySelector(".sticky-cta__hint").textContent).toBe(
      "Select at least one nozzle"
    );
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(started).toBe(1);
  });

  it("renders a link action when ctaTo is given and not blocked", () => {
    const container = render(
      <StickyCta summary="Ready" ctaLabel="Continue" ctaTo="/today/start" />
    );
    const link = container.querySelector("a.cta.sticky-cta__btn");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/today/start");
  });

  it("marks the busy state on the button and blocks presses", () => {
    let started = 0;
    const container = render(
      <StickyCta summary="Sending" ctaLabel="Submit" onCta={() => (started += 1)} busy />
    );
    const button = container.querySelector("button.cta");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".spinner")).toBeTruthy();
    expect(started).toBe(0);
  });

  it("carries a secondary action beside the pill", () => {
    const container = render(
      <StickyCta
        summary="Review"
        ctaLabel="Approve"
        onCta={() => {}}
        secondary={<button type="button">Send back</button>}
      />
    );
    const secondary = container.querySelector(".sticky-cta__secondary button");
    expect(secondary).toBeTruthy();
    expect(secondary.textContent).toBe("Send back");
  });
});
