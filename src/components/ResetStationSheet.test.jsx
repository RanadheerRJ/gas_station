// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ResetStationSheet from "./ResetStationSheet.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import * as api from "../lib/api.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

function render(ui) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<LanguageProvider>{ui}</LanguageProvider>);
  });
}

afterEach(() => {
  if (root) {
    act(() => root.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
});

function changeInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ResetStationSheet", () => {
  it("renders station name in title and warning notice", () => {
    const station = { id: "st-1", name: "Highway 44 Fuel" };
    render(
      <ResetStationSheet
        open={true}
        station={station}
        onClose={() => {}}
        onDone={() => {}}
      />
    );

    const title = container.querySelector(".sheet__head h2");
    expect(title?.textContent).toContain("Highway 44 Fuel");

    const notice = container.querySelector(".notice.error");
    expect(notice?.textContent).toContain("permanently deletes");
  });

  it("disables reset button until station name is typed correctly", () => {
    const station = { id: "st-1", name: "Highway 44 Fuel" };
    render(
      <ResetStationSheet
        open={true}
        station={station}
        onClose={() => {}}
        onDone={() => {}}
      />
    );

    const input = container.querySelector("input");
    const submitBtn = container.querySelector("button.danger");

    expect(submitBtn?.disabled).toBe(true);

    act(() => {
      changeInput(input, "wrong name");
    });

    expect(submitBtn?.disabled).toBe(true);

    act(() => {
      changeInput(input, "Highway 44 Fuel");
    });

    expect(submitBtn?.disabled).toBe(false);
  });

  it("calls resetStationData and onDone on confirm", async () => {
    const station = { id: "st-1", name: "Highway 44 Fuel" };
    const resetSpy = vi.spyOn(api, "resetStationData").mockResolvedValue({});
    const doneSpy = vi.fn();
    const closeSpy = vi.fn();

    render(
      <ResetStationSheet
        open={true}
        station={station}
        onClose={closeSpy}
        onDone={doneSpy}
      />
    );

    const input = container.querySelector("input");
    const form = container.querySelector("form");

    act(() => {
      changeInput(input, "Highway 44 Fuel");
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(resetSpy).toHaveBeenCalledWith("st-1");
    expect(doneSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("displays error message if API call fails", async () => {
    const station = { id: "st-1", name: "Highway 44 Fuel" };
    vi.spyOn(api, "resetStationData").mockRejectedValue(
      new Error("Owner access to this station is required.")
    );
    const doneSpy = vi.fn();
    const closeSpy = vi.fn();

    render(
      <ResetStationSheet
        open={true}
        station={station}
        onClose={closeSpy}
        onDone={doneSpy}
      />
    );

    const input = container.querySelector("input");
    const form = container.querySelector("form");

    act(() => {
      changeInput(input, "Highway 44 Fuel");
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const errorNotices = container.querySelectorAll(".notice.error");
    const hasError = Array.from(errorNotices).some((n) =>
      n.textContent.includes("Owner access to this station is required.")
    );
    expect(hasError).toBe(true);
    expect(doneSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
