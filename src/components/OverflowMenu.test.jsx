// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import OverflowMenu from "./OverflowMenu.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("OverflowMenu", () => {
  let container;
  let root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  function mount(items) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <LanguageProvider>
          <OverflowMenu items={items} />
        </LanguageProvider>
      );
    });
    return container.querySelector(".overflow-menu__trigger");
  }

  const press = (target, key) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

  it("is closed until the trigger is pressed, and labels the trigger", () => {
    const trigger = mount([{ key: "a", label: "Archive", onClick: () => {} }]);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBeTruthy();

    act(() => trigger.click());
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("runs the chosen action and closes", () => {
    const archive = vi.fn();
    const trigger = mount([
      { key: "a", label: "Archive", onClick: archive },
      { key: "r", label: "Reset", danger: true, onClick: () => {} },
    ]);
    act(() => trigger.click());
    const [first] = container.querySelectorAll('[role="menuitem"]');
    act(() => first.click());
    expect(archive).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("marks only the first destructive item after safe ones with a divider", () => {
    const trigger = mount([
      { key: "a", label: "Archive", onClick: () => {} },
      { key: "r", label: "Reset", danger: true, onClick: () => {} },
    ]);
    act(() => trigger.click());
    const [safe, danger] = container.querySelectorAll('[role="menuitem"]');
    expect(safe.className).not.toContain("is-danger");
    expect(danger.className).toContain("is-danger");
    expect(danger.className).toContain("has-divider");
  });

  it("moves focus with the arrow keys and wraps", () => {
    const trigger = mount([
      { key: "a", label: "One", onClick: () => {} },
      { key: "b", label: "Two", onClick: () => {} },
    ]);
    act(() => trigger.click());
    const [one, two] = container.querySelectorAll('[role="menuitem"]');
    expect(document.activeElement).toBe(one);
    press(one, "ArrowDown");
    expect(document.activeElement).toBe(two);
    press(two, "ArrowDown");
    expect(document.activeElement).toBe(one);
    press(one, "ArrowUp");
    expect(document.activeElement).toBe(two);
  });

  it("skips disabled items when navigating", () => {
    const trigger = mount([
      { key: "a", label: "One", onClick: () => {} },
      { key: "b", label: "Two", disabled: true, onClick: () => {} },
      { key: "c", label: "Three", onClick: () => {} },
    ]);
    act(() => trigger.click());
    const [one, , three] = container.querySelectorAll('[role="menuitem"]');
    press(one, "ArrowDown");
    expect(document.activeElement).toBe(three);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const trigger = mount([{ key: "a", label: "One", onClick: () => {} }]);
    act(() => trigger.click());
    press(document.activeElement, "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a press outside", () => {
    const trigger = mount([{ key: "a", label: "One", onClick: () => {} }]);
    act(() => trigger.click());
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("renders nothing when every item is falsy", () => {
    mount([false, null]);
    expect(container.querySelector(".overflow-menu")).toBeNull();
  });
});
