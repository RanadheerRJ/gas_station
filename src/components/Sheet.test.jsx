// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import Sheet from "./Sheet.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Sheet component and portal architecture", () => {
  let container;
  let root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    // Clean up any remaining portaled elements
    document.body.querySelectorAll(".sheet-root").forEach((el) => el.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <LanguageProvider>
          <Sheet open={false} onClose={() => {}} title="Test sheet">
            <div>Content</div>
          </Sheet>
        </LanguageProvider>
      );
    });

    expect(document.body.querySelector(".sheet-root")).toBeNull();
    expect(container.querySelector(".sheet-root")).toBeNull();
  });

  it("renders into document.body portal when opened", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <LanguageProvider>
          <Sheet open={true} onClose={() => {}} title="Test sheet">
            <button type="button">Action</button>
          </Sheet>
        </LanguageProvider>
      );
    });

    const sheetRoot = document.body.querySelector(".sheet-root");
    expect(sheetRoot).toBeTruthy();
    expect(sheetRoot.parentElement).toBe(document.body);
    expect(container.querySelector(".sheet-root")).toBeNull();
    expect(sheetRoot.querySelector("h2")?.textContent).toBe("Test sheet");
    expect(sheetRoot.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("removes sheet from DOM after closing phase animation completes", () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const renderSheet = (open) =>
      act(() => {
        root.render(
          <LanguageProvider>
            <Sheet open={open} onClose={() => {}} title="Test sheet">
              <button type="button">Action</button>
            </Sheet>
          </LanguageProvider>
        );
      });

    renderSheet(true);
    expect(document.body.querySelector(".sheet-root")).toBeTruthy();

    renderSheet(false);
    expect(document.body.querySelector(".sheet-root.closing")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.body.querySelector(".sheet-root")).toBeNull();
  });

  it("calls onClose when Escape key is pressed", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <LanguageProvider>
          <Sheet open={true} onClose={onClose} title="Test sheet">
            <button type="button">Inside</button>
          </Sheet>
        </LanguageProvider>
      );
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <LanguageProvider>
          <Sheet open={true} onClose={onClose} title="Test sheet">
            <button type="button">Inside</button>
          </Sheet>
        </LanguageProvider>
      );
    });

    const backdrop = document.body.querySelector(".backdrop");
    expect(backdrop).toBeTruthy();

    act(() => {
      backdrop.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <LanguageProvider>
          <Sheet open={true} onClose={onClose} title="Test sheet">
            <button type="button">Inside</button>
          </Sheet>
        </LanguageProvider>
      );
    });

    const closeBtn = document.body.querySelector(".sheet__close");
    expect(closeBtn).toBeTruthy();

    act(() => {
      closeBtn.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the sheet and restores it to the trigger on close", () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const trigger = document.createElement("button");
    trigger.textContent = "Open sheet";
    document.body.appendChild(trigger);
    trigger.focus();

    const renderSheet = (open) =>
      act(() => {
        root.render(
          <LanguageProvider>
            <Sheet open={open} onClose={() => {}} title="Test sheet">
              <button type="button">Save</button>
            </Sheet>
          </LanguageProvider>
        );
      });

    renderSheet(true);
    expect(document.activeElement).toBe(document.body.querySelector(".sheet-root"));

    renderSheet(false);
    act(() => vi.advanceTimersByTime(200));
    expect(document.activeElement).toBe(trigger);
  });

  it("traps keyboard tab focus inside the sheet", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <LanguageProvider>
          <Sheet open={true} onClose={() => {}} title="Test sheet">
            <button type="button" id="first-btn">
              First
            </button>
            <button type="button" id="last-btn">
              Last
            </button>
          </Sheet>
        </LanguageProvider>
      );
    });

    const closeBtn = document.body.querySelector(".sheet__close");
    const lastBtn = document.body.querySelector("#last-btn");

    // Close button is the first focusable element
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab on first element wraps to last
    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(shiftTabEvent);
    });
    expect(document.activeElement).toBe(lastBtn);

    // Tab on last element wraps to first (close button)
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(tabEvent);
    });
    expect(document.activeElement).toBe(closeBtn);
  });
});
