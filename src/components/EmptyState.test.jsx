// @vitest-environment jsdom
/**
 * EmptyState, pinned.
 *
 * An empty list gets one icon, one headline, one line of body copy and at
 * most one action — and the action is a real button or a real link, never a
 * decorative pill.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import EmptyState from "./EmptyState.jsx";
import { NozzleIcon } from "./icons.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MemoryRouter>{ui}</MemoryRouter>);
  });
  return container;
}

describe("EmptyState", () => {
  it("shows the icon, headline and body copy", () => {
    const container = render(
      <EmptyState icon={NozzleIcon} headline="Nothing here yet" body="Start a shift." />
    );
    expect(container.querySelector(".empty-state__icon svg")).toBeTruthy();
    expect(container.querySelector(".empty-state__title").textContent).toBe(
      "Nothing here yet"
    );
    expect(container.querySelector(".empty-state__body").textContent).toBe(
      "Start a shift."
    );
  });

  it("renders the action as a button that fires, when onAction is given", () => {
    let fired = 0;
    const container = render(
      <EmptyState
        headline="Empty"
        actionLabel="Start shift"
        onAction={() => (fired += 1)}
      />
    );
    const button = container.querySelector("button.empty-state__action");
    expect(button).toBeTruthy();
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(fired).toBe(1);
  });

  it("renders the action as a router link when actionTo is given", () => {
    const container = render(
      <EmptyState headline="Empty" actionLabel="Add station" actionTo="/owner" />
    );
    const link = container.querySelector("a.empty-state__action");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/owner");
  });

  it("renders no action at all without a label", () => {
    const container = render(<EmptyState headline="Nothing recorded" body="None yet." />);
    expect(container.querySelector("button, a")).toBeNull();
  });
});
