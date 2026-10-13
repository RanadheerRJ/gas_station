// @vitest-environment jsdom
/**
 * Chip and ChipRow, pinned.
 *
 * A filter chip is a real toggle button — aria-pressed carries the selection
 * so it is never colour-only — and its count badge rides along as text a
 * screen reader hears. Without an onClick the chip is a static span, because
 * a status is information, not a dead control.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Chip, ChipRow } from "./Chip.jsx";
import { PumpIcon } from "./icons.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(ui);
  });
  return container;
}

describe("Chip", () => {
  it("renders an interactive chip as a toggle button with aria-pressed", () => {
    const container = render(<Chip label="MS" selected onClick={() => {}} />);
    const chip = container.querySelector("button.chip");
    expect(chip).toBeTruthy();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.textContent).toContain("MS");
  });

  it("fires onClick and can be disabled", () => {
    let pressed = 0;
    const container = render(<Chip label="HSD" onClick={() => (pressed += 1)} />);
    act(() => {
      container
        .querySelector("button.chip")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(pressed).toBe(1);

    const disabled = render(<Chip label="HSD" disabled onClick={() => (pressed += 1)} />);
    expect(disabled.querySelector("button.chip").disabled).toBe(true);
  });

  it("shows a count badge as real text", () => {
    const container = render(<Chip label="All" count={12} onClick={() => {}} />);
    const badge = container.querySelector(".chip__count");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("12");
  });

  it("renders a static span with a tone when there is no onClick", () => {
    const container = render(<Chip label="Running" tone="ok" selected />);
    const chip = container.querySelector("span.chip");
    expect(chip).toBeTruthy();
    expect(chip.className).toContain("chip--ok");
    expect(chip.getAttribute("data-selected")).toBe("true");
    expect(container.querySelector("button")).toBeNull();
  });

  it("carries an icon before the label", () => {
    const container = render(<Chip label="Pumps" icon={PumpIcon} onClick={() => {}} />);
    expect(container.querySelector(".chip__icon svg")).toBeTruthy();
  });
});

describe("ChipRow", () => {
  it("names the group for assistive tech and keeps chips inline", () => {
    const container = render(
      <ChipRow label="Status">
        <Chip label="All" onClick={() => {}} />
        <Chip label="Live" onClick={() => {}} />
      </ChipRow>
    );
    const row = container.querySelector(".chip-row");
    expect(row).toBeTruthy();
    expect(row.getAttribute("role")).toBe("group");
    expect(row.getAttribute("aria-label")).toBe("Status");
    expect(row.querySelectorAll("button.chip")).toHaveLength(2);
  });
});
