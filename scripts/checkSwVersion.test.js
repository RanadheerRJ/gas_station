/**
 * The service worker cache-version rule, tested as a rule.
 *
 * The CLI around it needs a git repository; the decision it makes does not,
 * so that part is pure and pinned here. A regression in this logic is a
 * broken deploy on a phone that has the site installed, which is exactly the
 * failure nobody sees in review.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SW_PATH,
  evaluate,
  parseCacheVersion,
  watchedChanges,
} from "./checkSwVersion.mjs";

const swSource = readFileSync(new URL(`../${SW_PATH}`, import.meta.url), "utf8");

describe("parseCacheVersion", () => {
  it("reads the version out of the shipped service worker", () => {
    expect(parseCacheVersion(swSource)).toMatch(/^v\d+$/);
  });

  it("returns null when there is no version to find", () => {
    expect(parseCacheVersion("const OTHER = 1;")).toBeNull();
  });
});

describe("watchedChanges", () => {
  it("flags the stylesheet and any page, and nothing else", () => {
    expect(
      watchedChanges([
        "src/styles.css",
        "src/pages/OwnerStaff.jsx",
        "src/pages/setup/PumpCard.jsx",
        "src/components/Layout.jsx",
        "README.md",
        "src/pages/notes.md",
      ])
    ).toEqual([
      "src/styles.css",
      "src/pages/OwnerStaff.jsx",
      "src/pages/setup/PumpCard.jsx",
    ]);
  });
});

describe("evaluate", () => {
  it("fails when a page changed without a cache version bump", () => {
    const result = evaluate({
      changedFiles: ["src/pages/OwnerStaff.jsx"],
      baseVersion: "v6",
      headVersion: "v6",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("v7");
  });

  it("fails when the stylesheet changed without a cache version bump", () => {
    const result = evaluate({
      changedFiles: ["src/styles.css"],
      baseVersion: "v6",
      headVersion: "v6",
    });
    expect(result.ok).toBe(false);
  });

  it("passes once the version is bumped alongside those files", () => {
    const result = evaluate({
      changedFiles: ["src/styles.css", "src/pages/OwnerStaff.jsx"],
      baseVersion: "v6",
      headVersion: "v7",
    });
    expect(result.ok).toBe(true);
  });

  it("passes when nothing that affects the built assets changed", () => {
    const result = evaluate({
      changedFiles: ["README.md", "supabase/migrations/20260101_x.sql"],
      baseVersion: "v6",
      headVersion: "v6",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a version that goes backwards", () => {
    const result = evaluate({
      changedFiles: ["src/styles.css"],
      baseVersion: "v7",
      headVersion: "v6",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("backwards");
  });

  it("rejects a malformed or missing version", () => {
    expect(evaluate({ changedFiles: [], headVersion: null }).ok).toBe(false);
    expect(evaluate({ changedFiles: [], headVersion: "2026-09-26" }).ok).toBe(false);
  });
});
