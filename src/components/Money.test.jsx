// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import Money from "./Money.jsx";
import { money } from "../lib/format.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function render(ui) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  return container.querySelector(".money");
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Money", () => {
  it.each([
    ["in", "+"],
    ["out", "−"],
    ["credit", "◷"],
    ["neutral", "="],
  ])("renders the %s class and a non-colour marker", (kind, marker) => {
    const element = render(<Money kind={kind} value={1234.5} label="Test amount" />);

    expect(element.classList.contains(`money--${kind}`)).toBe(true);
    expect(element.querySelector(".money__marker").textContent).toBe(marker);
    expect(element.getAttribute("aria-label")).toContain("Test amount");
    expect(element.getAttribute("aria-label")).toContain(money(1234.5));
  });

  it("keeps the app's existing money formatting", () => {
    const element = render(<Money kind="neutral" value={1234567.8} label="Sales" />);

    expect(element.querySelector(".money__amount").textContent).toContain(
      money(1234567.8)
    );
  });

  it.each([
    [0.5, "ok", "balanced", "✓"],
    [-20, "short", "short", "▼"],
    [20, "over", "excess", "▲"],
  ])("uses the existing verdict for variance %s", (value, state, verdict, marker) => {
    const element = render(<Money kind="variance" value={value} label="Variance" />);

    expect(element.classList.contains(`money--${state}`)).toBe(true);
    expect(element.dataset.variance).toBe(verdict);
    expect(element.querySelector(".money__marker").textContent).toBe(marker);
    expect(element.getAttribute("aria-label")).toContain(money(Math.abs(value)));
  });

  it("marks large figures without changing their value", () => {
    const element = render(<Money kind="in" value={25} label="Received" size="lg" />);

    expect(element.classList.contains("money--lg")).toBe(true);
    expect(element.textContent).toContain(money(25));
  });
});
