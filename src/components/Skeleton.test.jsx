// @vitest-environment jsdom
/**
 * Skeleton, pinned.
 *
 * A loading placeholder must tell assistive tech it is loading (role=status,
 * aria-busy) while keeping its shapes silent, and it must render the shape
 * it was asked for — card or row — as many times as requested.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Skeleton from "./Skeleton.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<LanguageProvider>{ui}</LanguageProvider>);
  });
  return container;
}

describe("Skeleton", () => {
  it("announces loading and keeps the shapes themselves silent", () => {
    const container = render(<Skeleton shape="row" />);
    const root = container.querySelector(".skeleton-stack");
    expect(root).toBeTruthy();
    expect(root.getAttribute("role")).toBe("status");
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(root.getAttribute("aria-label")).toBe("Loading");
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("renders one card shape with a figure line, by default", () => {
    const container = render(<Skeleton shape="card" />);
    expect(container.querySelectorAll(".skeleton-card")).toHaveLength(1);
    expect(container.querySelector(".skeleton-figure")).toBeTruthy();
    expect(container.querySelector(".skeleton-avatar")).toBeNull();
  });

  it("renders the requested number of row shapes, capped sensibly", () => {
    const container = render(<Skeleton shape="row" count={3} />);
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(3);
    expect(container.querySelectorAll(".skeleton-avatar")).toHaveLength(3);

    const greedy = render(<Skeleton shape="row" count={99} />);
    expect(greedy.querySelectorAll(".skeleton-row").length).toBeLessThanOrEqual(12);
  });
});
