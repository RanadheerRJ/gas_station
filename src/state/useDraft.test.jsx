// @vitest-environment jsdom
/**
 * The draft contract, exercised through a real mounted component: values
 * leave no trace until they diverge from the initial, survive an unmount
 * (the "phone died mid-close" case), project old drafts onto today's form
 * shape, and clean up after themselves the moment they are submitted or
 * reset.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useDraft } from "./useDraft.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;
// The latest [value, setValue, clear] triple, captured by the harness below.
let latest = null;

function Harness({ draftKey, initial }) {
  latest = useDraft(draftKey, initial);
  return null;
}

async function mount(draftKey, initial) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Harness draftKey={draftKey} initial={initial} />);
  });
}

async function unmount() {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  latest = null;
}

const stored = (key) => window.localStorage.getItem(`petrav.draft.${key}`);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await unmount();
});

describe("useDraft", () => {
  it("stores nothing until the value leaves the initial", async () => {
    await mount("t1", { a: "" });
    expect(latest[0]).toEqual({ a: "" });
    expect(stored("t1")).toBeNull();

    await act(async () => {
      latest[1]({ a: "42" });
    });
    expect(JSON.parse(stored("t1"))).toEqual({ a: "42" });
  });

  it("hydrates a stored draft over a fresh mount", async () => {
    await mount("t2", { a: "", b: "" });
    await act(async () => {
      latest[1]({ a: "1", b: "2" });
    });
    // The phone died; a new session mounts the same form.
    await unmount();
    await mount("t2", { a: "", b: "" });
    expect(latest[0]).toEqual({ a: "1", b: "2" });
  });

  it("projects an object draft onto the current initial shape", async () => {
    // A draft written by an older build: `gone` was removed since, `added`
    // did not exist yet.
    window.localStorage.setItem(
      "petrav.draft.t3",
      JSON.stringify({ a: "kept", gone: "stale" })
    );
    await mount("t3", { a: "", added: "x" });
    expect(latest[0]).toEqual({ a: "kept", added: "x" });
  });

  it("clear() resets to initial and removes the key synchronously", async () => {
    await mount("t4", "");
    await act(async () => {
      latest[1]("typed");
    });
    expect(stored("t4")).toBe(JSON.stringify("typed"));

    let during;
    await act(async () => {
      latest[2]();
      // Synchronous by contract: callers clear right before navigating away,
      // when the state update may never render.
      during = stored("t4");
    });
    expect(during).toBeNull();
    expect(latest[0]).toBe("");
  });

  it("returning to the initial via setValue removes the key too", async () => {
    await mount("t5", { a: "" });
    await act(async () => {
      latest[1]({ a: "9" });
    });
    expect(stored("t5")).not.toBeNull();
    await act(async () => {
      latest[1]({ a: "" });
    });
    expect(stored("t5")).toBeNull();
  });

  it("falls back to the initial when the stored draft is corrupt", async () => {
    window.localStorage.setItem("petrav.draft.t6", "{not json");
    await mount("t6", { a: "safe" });
    expect(latest[0]).toEqual({ a: "safe" });
  });

  it("adopts a pre-rename draft once, without resurrecting it later", async () => {
    // A draft saved by the PumpMithra-era build, still mid-form at upgrade.
    window.localStorage.setItem("pumpmithra.draft.t8", JSON.stringify({ a: "legacy" }));
    await mount("t8", { a: "" });
    expect(latest[0]).toEqual({ a: "legacy" });
    // Adopted: the value now lives under the new key, the old one is gone.
    expect(JSON.parse(stored("t8"))).toEqual({ a: "legacy" });
    expect(window.localStorage.getItem("pumpmithra.draft.t8")).toBeNull();

    // …so clearing the form cannot bring the legacy draft back on reload.
    await act(async () => {
      latest[2]();
    });
    await unmount();
    await mount("t8", { a: "" });
    expect(latest[0]).toEqual({ a: "" });
  });

  it("keeps different keys apart", async () => {
    await mount("t7a", { a: "" });
    await act(async () => {
      latest[1]({ a: "seven" });
    });
    await unmount();
    await mount("t7b", { a: "" });
    expect(latest[0]).toEqual({ a: "" });
    expect(JSON.parse(stored("t7a"))).toEqual({ a: "seven" });
  });
});
