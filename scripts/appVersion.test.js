/**
 * The app version is the pull request number. These pin the resolution order,
 * because getting it wrong means a support call is answered with a version
 * that does not identify the running build.
 */

import { describe, expect, it } from "vitest";
import { parseMergedPr, parsePullRef, resolveAppVersion } from "./appVersion.mjs";

describe("parseMergedPr", () => {
  it("reads the number out of a merge subject", () => {
    expect(parseMergedPr("Merge pull request #49 from RanadheerRJ/arena/x")).toBe(49);
  });

  it("takes the newest merge when several are listed", () => {
    const log = [
      "Merge pull request #50 from RanadheerRJ/arena/b",
      "Some direct commit",
      "Merge pull request #49 from RanadheerRJ/arena/a",
    ].join("\n");
    expect(parseMergedPr(log)).toBe(50);
  });

  it("is null when nothing was merged through a pull request", () => {
    expect(parseMergedPr("wip: trying things")).toBe(null);
    expect(parseMergedPr("")).toBe(null);
  });
});

describe("parsePullRef", () => {
  it("reads a pull request ref", () => {
    expect(parsePullRef("refs/pull/47/merge")).toBe(47);
    expect(parsePullRef("refs/pull/47/head")).toBe(47);
  });

  it("ignores branch refs", () => {
    expect(parsePullRef("refs/heads/main")).toBe(null);
  });
});

describe("resolveAppVersion", () => {
  it("prefers the number CI resolved from the GitHub API", () => {
    const v = resolveAppVersion({
      env: { APP_PR_NUMBER: "49", GITHUB_REF: "refs/pull/12/merge" },
      gitLog: "Merge pull request #7 from x",
      packageVersion: "1.0.0",
    });
    expect(v).toMatchObject({ pr: 49, version: "49", label: "PR #49", source: "env" });
  });

  it("falls back to the pull request ref on a PR build", () => {
    const v = resolveAppVersion({
      env: { GITHUB_REF: "refs/pull/47/merge" },
      gitLog: "Merge pull request #7 from x",
    });
    expect(v).toMatchObject({ pr: 47, label: "PR #47", source: "pull-ref" });
  });

  it("falls back to the git history, so a plain clone agrees with CI", () => {
    const v = resolveAppVersion({
      gitLog: "Merge pull request #49 from RanadheerRJ/arena/x\nearlier work",
      packageVersion: "1.0.0",
    });
    expect(v).toMatchObject({ pr: 49, label: "PR #49", source: "git" });
  });

  it("falls back to the package version when no pull request is known", () => {
    const v = resolveAppVersion({ gitLog: "initial commit", packageVersion: "1.0.0" });
    expect(v).toMatchObject({ pr: null, version: "1.0.0", label: "v1.0.0" });
  });

  it("ignores an empty or non-numeric env override", () => {
    const v = resolveAppVersion({
      env: { APP_PR_NUMBER: "", VITE_APP_PR_NUMBER: "none" },
      gitLog: "Merge pull request #49 from x",
    });
    expect(v.pr).toBe(49);
  });
});
