#!/usr/bin/env node
/**
 * Resolve the number shown to operators as "the version of the app".
 *
 * The team ships through pull requests: every change that reaches main arrives
 * as one merged PR, and `main` is what GitHub Pages deploys. So the pull
 * request number is the most honest release identifier this project has — far
 * more useful on a support call ("which version are you on?" → "PR 49") than a
 * hand-maintained semver in package.json that nobody remembers to bump.
 *
 * Resolution order, most explicit first:
 *
 *   1. APP_PR_NUMBER / VITE_APP_PR_NUMBER — set by CI, which asks the GitHub
 *      API which pull request produced the commit being deployed.
 *   2. GITHUB_REF of a pull request build (refs/pull/47/merge) — the number of
 *      the PR currently being previewed.
 *   3. The git history: the newest "Merge pull request #N" subject reachable
 *      from HEAD. This is what a plain `git clone` of main sees, so a local
 *      build reports the same number CI would, with no configuration at all.
 *   4. Nothing — the build is on an unmerged branch or a tarball with no git
 *      metadata, and the app falls back to the package.json version.
 *
 * Keeping the logic here (rather than inline in vite.config.js) makes it
 * testable without running a build, and reusable from CI scripts.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The first "Merge pull request #N" number in a block of git log subjects. */
export function parseMergedPr(log) {
  const match = /Merge pull request #(\d+)/.exec(log || "");
  return match ? Number(match[1]) : null;
}

/** The PR number in a pull-request ref such as `refs/pull/47/merge`. */
export function parsePullRef(ref) {
  const match = /^refs\/pull\/(\d+)\//.exec(ref || "");
  return match ? Number(match[1]) : null;
}

/** A positive integer from an env var, or null for absent/garbage values. */
function parseEnvNumber(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Decide the version from already-gathered facts, so the rule is testable
 * without a git repository or a CI environment.
 *
 * @param {object} facts
 * @param {Record<string, string|undefined>} [facts.env]
 * @param {string} [facts.gitLog] output of `git log --format=%s -n <k>`
 * @param {string} [facts.packageVersion] fallback from package.json
 */
export function resolveAppVersion({ env = {}, gitLog = "", packageVersion = "" } = {}) {
  const fromEnv =
    parseEnvNumber(env.APP_PR_NUMBER) ?? parseEnvNumber(env.VITE_APP_PR_NUMBER);
  if (fromEnv) return format(fromEnv, "env");

  const fromRef = parsePullRef(env.GITHUB_REF);
  if (fromRef) return format(fromRef, "pull-ref");

  const fromLog = parseMergedPr(gitLog);
  if (fromLog) return format(fromLog, "git");

  return {
    pr: null,
    version: packageVersion || "0.0.0",
    label: packageVersion ? `v${packageVersion}` : "dev build",
    source: "package",
  };
}

function format(pr, source) {
  return { pr, version: String(pr), label: `PR #${pr}`, source };
}

/* ------------------------------------------------------------------ */
/* Collecting the facts                                                */
/* ------------------------------------------------------------------ */

function gitSubjects(count = 80) {
  try {
    return execFileSync("git", ["log", `-n${count}`, "--format=%s"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // No git metadata (tarball, Docker build context): not an error.
    return "";
  }
}

function packageVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    return pkg.version || "";
  } catch {
    return "";
  }
}

/** The version for the current working tree, reading git and the environment. */
export function currentAppVersion(env = process.env) {
  return resolveAppVersion({
    env,
    gitLog: gitSubjects(),
    packageVersion: packageVersion(),
  });
}

/* ------------------------------------------------------------------ */
/* CLI: `node scripts/appVersion.mjs [--label|--pr|--json]`            */
/* ------------------------------------------------------------------ */

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const resolved = currentAppVersion();
  const flag = process.argv[2] || "--label";
  if (flag === "--json") console.log(JSON.stringify(resolved));
  else if (flag === "--pr") console.log(resolved.pr ?? "");
  else if (flag === "--version") console.log(resolved.version);
  else console.log(resolved.label);
}
