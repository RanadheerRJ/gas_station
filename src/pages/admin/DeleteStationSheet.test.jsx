// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import DeleteStationSheet from "./DeleteStationSheet.jsx";
import { LanguageProvider } from "../../state/LanguageContext.jsx";

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

const STATION = {
  stationId: "st-1",
  name: "Highway 44 Fuel",
  address: "NH-44",
  state: "active",
  staffCount: 3,
};

describe("DeleteStationSheet", () => {
  it("names the station and warns that the deletion is permanent", () => {
    render(
      <DeleteStationSheet
        open
        station={STATION}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    const title = document.body.querySelector(".sheet__head h2");
    expect(title?.textContent).toContain("Highway 44 Fuel");

    const text = document.body.textContent;
    expect(text).toContain("permanently deletes");
    // What survives is stated as plainly as what goes.
    expect(text).toContain("owner account");
  });

  it("counts the logins that go with the station", () => {
    render(
      <DeleteStationSheet
        open
        station={STATION}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(document.body.textContent).toContain("3 manager and attendant logins");
  });

  it("uses the singular login warning for one login, and none for zero", () => {
    render(
      <DeleteStationSheet
        open
        station={{ ...STATION, staffCount: 1 }}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(document.body.textContent).toContain("1 manager or attendant login");

    act(() => root.unmount());
    container.remove();
    root = null;
    container = null;

    render(
      <DeleteStationSheet
        open
        station={{ ...STATION, staffCount: 0 }}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(document.body.textContent).not.toContain("attendant login");
  });

  it("keeps the delete button disabled until the name is typed", () => {
    render(
      <DeleteStationSheet
        open
        station={STATION}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    const input = document.body.querySelector("input");
    const confirm = document.body.querySelector("button.danger");
    expect(confirm.disabled).toBe(true);

    act(() => changeInput(input, "Highway"));
    expect(confirm.disabled).toBe(true);

    act(() => changeInput(input, "highway 44 fuel"));
    expect(confirm.disabled).toBe(false);
  });

  it("confirms with the station once the name matches", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteStationSheet
        open
        station={STATION}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    const input = document.body.querySelector("input");
    const form = document.body.querySelector("form");

    act(() => changeInput(input, "Highway 44 Fuel"));
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith(STATION);
  });

  it("shows the action's error and leaves the sheet open", () => {
    render(
      <DeleteStationSheet
        open
        station={STATION}
        error="A shift is still open at this station."
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(document.body.textContent).toContain("A shift is still open at this station.");
  });

  it("cannot be confirmed or cancelled while the delete is running", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteStationSheet
        open
        busy
        station={STATION}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    const buttons = Array.from(document.body.querySelectorAll("button")).filter(
      (b) => !b.className.includes("sheet__close")
    );
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(document.body.textContent).toContain("Deleting");
  });

  it("clears the typed name between stations", () => {
    render(
      <DeleteStationSheet
        open
        station={STATION}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    act(() => changeInput(document.body.querySelector("input"), "Highway 44 Fuel"));
    expect(document.body.querySelector("button.danger").disabled).toBe(false);

    act(() => {
      root.render(
        <LanguageProvider>
          <DeleteStationSheet
            open
            station={{ ...STATION, stationId: "st-2", name: "City Centre" }}
            onClose={() => {}}
            onConfirm={() => {}}
          />
        </LanguageProvider>
      );
    });

    expect(document.body.querySelector("input").value).toBe("");
    expect(document.body.querySelector("button.danger").disabled).toBe(true);
  });
});
