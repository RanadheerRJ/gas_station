import { describe, expect, it } from "vitest";
import { SHIFT_PATHS, shiftPaths } from "./paths.js";

/**
 * The contract every consumer of SHIFT_PATHS leans on. The screens are
 * shared across three roles, so a role missing a key does not fail loudly —
 * it renders a Link with an undefined `to` (a back arrow that goes nowhere)
 * or navigates to "undefined". This test makes the omission fail in CI
 * instead.
 */

const ROLES = ["attendant", "manager", "owner"];

describe("every role exposes the same core keys", () => {
  it.each(ROLES)("%s has home/start/list as strings", (role) => {
    const paths = SHIFT_PATHS[role];
    expect(typeof paths.home).toBe("string");
    expect(typeof paths.start).toBe("string");
    expect(typeof paths.list).toBe("string");
  });

  it.each(ROLES)("%s has detail/close as functions of an id", (role) => {
    const paths = SHIFT_PATHS[role];
    expect(typeof paths.detail).toBe("function");
    expect(typeof paths.close).toBe("function");
    expect(typeof paths.detail("x")).toBe("string");
    expect(typeof paths.close("x")).toBe("string");
  });
});

describe("run is the attendant-only extra", () => {
  it("attendant has a run screen", () => {
    expect(typeof SHIFT_PATHS.attendant.run).toBe("function");
    expect(SHIFT_PATHS.attendant.run("s1")).toBe("/today/shift/s1");
  });

  // Managers and owners never run a shift, and the close screen's back
  // arrow relies on `run` being absent to fall back to their list.
  it.each(["manager", "owner"])("%s has none", (role) => {
    expect(SHIFT_PATHS[role].run).toBeUndefined();
  });
});

describe("the URLs match the routes App.jsx mounts", () => {
  it("attendant", () => {
    const p = SHIFT_PATHS.attendant;
    expect(p.home).toBe("/today");
    expect(p.start).toBe("/today/start");
    expect(p.list).toBe("/today/history");
    expect(p.detail("s1")).toBe("/today/history/s1");
    expect(p.correct("s1")).toBe("/today/history/s1/edit");
    expect(p.run("s1")).toBe("/today/shift/s1");
    expect(p.close("s1")).toBe("/today/shift/s1/close");
  });

  it("manager", () => {
    const p = SHIFT_PATHS.manager;
    expect(p.home).toBe("/station");
    expect(p.start).toBe("/station/start");
    expect(p.list).toBe("/station");
    expect(p.detail("s1")).toBe("/station/shift/s1");
    expect(p.close("s1")).toBe("/station/shift/s1/close");
  });

  it("owner", () => {
    const p = SHIFT_PATHS.owner;
    expect(p.home).toBe("/owner/shifts");
    expect(p.start).toBe("/owner/shifts/start");
    expect(p.list).toBe("/owner/shifts");
    expect(p.detail("s1")).toBe("/owner/shifts/s1");
    expect(p.close("s1")).toBe("/owner/shifts/s1/close");
  });
});

describe("shiftPaths", () => {
  it("returns each role's own paths", () => {
    ROLES.forEach((role) => {
      expect(shiftPaths(role)).toBe(SHIFT_PATHS[role]);
    });
  });

  it("falls back to the manager's paths for an unknown role", () => {
    expect(shiftPaths("admin")).toBe(SHIFT_PATHS.manager);
    expect(shiftPaths(undefined)).toBe(SHIFT_PATHS.manager);
  });
});
