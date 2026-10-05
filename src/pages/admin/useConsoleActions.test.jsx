// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useConsoleActions } from "./useConsoleActions.js";
import * as api from "../../lib/api.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;
let hook = null;

/** Mount the hook and expose its latest return value as `hook`. */
function mount(reload) {
  function Probe() {
    hook = useConsoleActions(reload);
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });
}

beforeEach(() => {
  hook = null;
});

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

describe("useConsoleActions", () => {
  it("starts idle", () => {
    mount();
    expect(hook.busy).toBe(false);
    expect(hook.error).toBe("");
    expect(hook.done).toBe(null);
  });

  it("creates a station, notes it, and reloads", async () => {
    const spy = vi.spyOn(api, "adminCreateStation").mockResolvedValue({});
    const reload = vi.fn().mockResolvedValue();
    mount(reload);

    let result;
    await act(async () => {
      result = await hook.createStation({
        ownerId: "o-1",
        name: "Highway 44",
        address: "NH-44",
      });
    });

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith({
      ownerId: "o-1",
      name: "Highway 44",
      address: "NH-44",
    });
    expect(reload).toHaveBeenCalled();
    expect(hook.done).toEqual({
      key: "admin.stationCreated",
      params: { name: "Highway 44" },
    });
    expect(hook.busy).toBe(false);
  });

  it("updates a station by its registry id", async () => {
    const spy = vi.spyOn(api, "adminUpdateStation").mockResolvedValue({});
    mount();

    await act(async () => {
      await hook.updateStation(
        { stationId: "st-1", name: "Old name" },
        { name: "New name", address: "NH-44" }
      );
    });

    expect(spy).toHaveBeenCalledWith("st-1", { name: "New name", address: "NH-44" });
    expect(hook.done.params).toEqual({ name: "New name" });
  });

  it("distinguishes archiving from reactivating in the note", async () => {
    vi.spyOn(api, "adminSetStationState").mockResolvedValue({});
    mount();

    await act(async () => {
      await hook.setStationState({ stationId: "st-1", name: "Highway 44" }, "archived");
    });
    expect(hook.done.key).toBe("admin.stationArchived");

    await act(async () => {
      await hook.setStationState({ stationId: "st-1", name: "Highway 44" }, "active");
    });
    expect(hook.done.key).toBe("admin.stationActivated");
  });

  it("deletes a station through the accounts function and reloads", async () => {
    const spy = vi.spyOn(api, "deleteStation").mockResolvedValue({ ok: true });
    const reload = vi.fn().mockResolvedValue();
    mount(reload);

    let result;
    await act(async () => {
      result = await hook.removeStation({ stationId: "st-1", name: "Highway 44" });
    });

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith("st-1");
    expect(reload).toHaveBeenCalled();
    expect(hook.done).toEqual({
      key: "admin.stationDeleted",
      params: { name: "Highway 44" },
    });
  });

  it("reports a failed delete and does not reload", async () => {
    vi.spyOn(api, "deleteStation").mockRejectedValue(
      new Error("A shift is still open at this station.")
    );
    const reload = vi.fn().mockResolvedValue();
    mount(reload);

    let result;
    await act(async () => {
      result = await hook.removeStation({ stationId: "st-1", name: "Highway 44" });
    });

    expect(result).toBe(false);
    expect(hook.error).toContain("A shift is still open");
    expect(hook.done).toBe(null);
    expect(reload).not.toHaveBeenCalled();
    expect(hook.busy).toBe(false);
  });

  it("clears a previous error when the next action starts", async () => {
    vi.spyOn(api, "adminUpdateProfile")
      .mockRejectedValueOnce(new Error("No."))
      .mockResolvedValueOnce({});
    mount();

    await act(async () => {
      await hook.updateAccount({ uid: "u-1", name: "Amy" }, { name: "Amy", phone: "" });
    });
    expect(hook.error).toBeTruthy();

    await act(async () => {
      await hook.updateAccount({ uid: "u-1", name: "Amy" }, { name: "Amy B", phone: "" });
    });
    expect(hook.error).toBe("");
    expect(hook.done.key).toBe("admin.accountUpdated");
  });

  it("deletes a login by uid", async () => {
    const spy = vi.spyOn(api, "deleteAccount").mockResolvedValue({ ok: true });
    mount();

    await act(async () => {
      await hook.removeAccount({ uid: "u-9", name: "Ben" });
    });

    expect(spy).toHaveBeenCalledWith("u-9");
    expect(hook.done).toEqual({
      key: "admin.accountDeleted",
      params: { name: "Ben" },
    });
  });

  it("drops the note on demand", async () => {
    vi.spyOn(api, "deleteAccount").mockResolvedValue({ ok: true });
    mount();

    await act(async () => {
      await hook.removeAccount({ uid: "u-9", name: "Ben" });
    });
    expect(hook.done).not.toBe(null);

    act(() => hook.clearDone());
    expect(hook.done).toBe(null);
  });
});
