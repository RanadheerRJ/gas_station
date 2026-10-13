// @vitest-environment jsdom
/**
 * ListRow, pinned.
 *
 * The order-history row: whatever renders it (link, button or static row),
 * the title, subtitle and trailing figure are real text, the chevron only
 * appears when the row actually goes somewhere, and an avatar row derives
 * its initials from the name the way shift cards do.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import ListRow from "./ListRow.jsx";
import { TankIcon } from "./icons.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MemoryRouter>{ui}</MemoryRouter>);
  });
  return container;
}

describe("ListRow", () => {
  it("renders a router Link with title, subtitle, trailing value and chevron", () => {
    const container = render(
      <ListRow
        icon={TankIcon}
        title="MS tank 1"
        subtitle="12,000 L capacity"
        trailing={<span>8,420 L</span>}
        to="/owner/stock/t1"
      />
    );
    const row = container.querySelector("a.list-row.list-row--press");
    expect(row).toBeTruthy();
    expect(row.getAttribute("href")).toBe("/owner/stock/t1");
    expect(row.querySelector(".list-row__title").textContent).toBe("MS tank 1");
    expect(row.querySelector(".list-row__subtitle").textContent).toBe(
      "12,000 L capacity"
    );
    expect(row.querySelector(".list-row__trailing").textContent).toBe("8,420 L");
    expect(row.querySelector(".list-row__chevron")).toBeTruthy();
    expect(row.querySelector(".list-row__icon svg")).toBeTruthy();
  });

  it("renders a button that fires onClick, without a chevron when asked", () => {
    let opened = 0;
    const container = render(
      <ListRow title="A row" onClick={() => (opened += 1)} chevron={false} />
    );
    const row = container.querySelector("button.list-row");
    expect(row).toBeTruthy();
    act(() => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(opened).toBe(1);
    expect(row.querySelector(".list-row__chevron")).toBeNull();
  });

  it("renders a static row — no control, no chevron — when it goes nowhere", () => {
    const container = render(
      <ListRow avatar="Suresh Babu" title="Suresh Babu" subtitle="last week" />
    );
    expect(container.querySelector("button, a")).toBeNull();
    const row = container.querySelector(".list-row");
    expect(row.className).not.toContain("list-row--press");
    expect(row.querySelector(".list-row__chevron")).toBeNull();
  });

  it("derives avatar initials and a stable hue from the name", () => {
    const container = render(<ListRow avatar="Suresh Babu" title="Suresh Babu" />);
    const avatar = container.querySelector(".list-row__avatar");
    expect(avatar).toBeTruthy();
    expect(avatar.textContent).toBe("SB");
    expect(avatar.style.getPropertyValue("--avatar-hue")).toBeTruthy();
  });
});
