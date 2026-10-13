// @vitest-environment jsdom
/**
 * Card, pinned.
 *
 * The card is the atom every list screen is built from, so the three things
 * that matter are fixed here: it renders as a plain section by default, as a
 * router Link when it goes somewhere, and as a real button (with a disabled
 * state) when it acts — never a clickable div.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { Card } from "./Card.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MemoryRouter>{ui}</MemoryRouter>);
  });
  return container;
}

describe("Card", () => {
  it("renders a static section by default, with no pressable state", () => {
    const container = render(<Card className="extra">body</Card>);
    const card = container.querySelector("section.card");
    expect(card).toBeTruthy();
    expect(card.className).toContain("card");
    expect(card.className).not.toContain("card--pressable");
    expect(card.className).toContain("extra");
    expect(card.textContent).toBe("body");
  });

  it("keeps the flush modifier for headerless card bodies", () => {
    const container = render(<Card flush>body</Card>);
    expect(container.querySelector("section.card.card--flush")).toBeTruthy();
  });

  it("renders as a router Link with pressable styling when `to` is given", () => {
    const container = render(<Card to="/owner/shifts">go</Card>);
    const link = container.querySelector("a.card.card--pressable");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/owner/shifts");
  });

  it("renders as a button that fires onClick, and can be disabled", () => {
    let presses = 0;
    const container = render(
      <Card onClick={() => (presses += 1)} disabled>
        act
      </Card>
    );
    const button = container.querySelector("button.card.card--pressable");
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(presses).toBe(0);

    const enabled = render(<Card onClick={() => (presses += 1)}>act</Card>);
    const fire = enabled.querySelector("button.card");
    act(() => {
      fire.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(presses).toBe(1);
  });
});
