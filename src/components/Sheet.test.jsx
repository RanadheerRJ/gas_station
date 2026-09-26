// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import Sheet from "./Sheet.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Sheet focus management", () => {
  let container;
  let root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    vi.useRealTimers();
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
    expect(document.activeElement).toBe(container.querySelector(".sheet-root"));

    renderSheet(false);
    act(() => vi.advanceTimersByTime(200));
    expect(document.activeElement).toBe(trigger);
  });
});
