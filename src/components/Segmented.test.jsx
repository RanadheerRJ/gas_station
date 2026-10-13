// @vitest-environment jsdom
/**
 * Segmented, pinned.
 *
 * The either/or switch is a real tablist: exactly one option is selected at
 * a time, selection is carried by aria-selected (not colour alone), and
 * pressing an option hands its value to the screen.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Segmented } from "./ui.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(ui);
  });
  return container;
}

const OPTIONS = [
  { value: "activity", label: "Activity" },
  { value: "statement", label: "Statement" },
];

describe("Segmented", () => {
  it("marks exactly one option selected via aria-selected", () => {
    const container = render(
      <Segmented value="activity" onChange={() => {}} options={OPTIONS} />
    );
    const buttons = container.querySelectorAll(".segmented button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
    expect(buttons[0].className).toContain("active");
    expect(buttons[1].getAttribute("aria-selected")).toBe("false");
    expect(buttons[1].className).not.toContain("active");
  });

  it("hands the pressed option's value to onChange", () => {
    let picked = null;
    const container = render(
      <Segmented value="activity" onChange={(v) => (picked = v)} options={OPTIONS} />
    );
    act(() => {
      container
        .querySelectorAll(".segmented button")[1]
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(picked).toBe("statement");
  });

  it("names itself a tablist for assistive tech", () => {
    const container = render(
      <Segmented value="a" onChange={() => {}} options={OPTIONS} />
    );
    expect(container.querySelector(".segmented").getAttribute("role")).toBe("tablist");
  });
});
