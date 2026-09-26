// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders a fallback when a child throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    const root = createRoot(container);

    function BrokenComponent() {
      throw new Error("broken render");
    }

    act(() => {
      root.render(
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>
      );
    });

    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).toContain("Reload");
    expect(consoleError).toHaveBeenCalled();

    act(() => root.unmount());
  });
});
