#!/usr/bin/env node
/**
 * Guard: the service worker cache version must be bumped whenever the built
 * assets change.
 *
 * `public/sw.js` caches the app shell, and the shell names content-hashed
 * bundles. Editing `src/styles.css` or any screen under `src/pages/` gives
 * those bundles new filenames, so a phone still holding the previous deploy's
 * shell asks for files the new deploy does not serve. Renaming the caches —
 * which is all `const VERSION = "vN"` does — makes the activate handler drop
 * the stale copies, so the fix lands without anyone clearing site data.
 *
 * Usage:
 *   node scripts/checkSwVersion.mjs               # compare against origin/main
 *   node scripts/checkSwVersion.mjs --base <ref>  # compare against <ref>
 *   node scripts/checkSwVersion.mjs --strict      # fail if the base is unresolvable
 *
 * The check is deliberately forgiving about a missing base ref (a shallow
 * clone, a detached checkout): it reports and passes, unless --strict is set.
 * CI passes the pull request's base branch explicitly.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Files whose content ends up in a content-hashed bundle the shell names. */
export const WATCHED_PATTERNS = [
  { label: "src/styles.css", test: (f) => f === "src/styles.css" },
  {
    label: "src/pages/**/*.jsx",
    test: (f) => f.startsWith("src/pages/") && f.endsWith(".jsx"),
  },
];

export const SW_PATH = "public/sw.js";

/** The `vN` string from a service worker source, or null if absent. */
export function parseCacheVersion(source) {
  const match = /const\s+VERSION\s*=\s*["'`]([^"'`]+)["'`]/.exec(source || "");
  return match ? match[1] : null;
}

/** The subset of changed paths that force a cache version bump. */
export function watchedChanges(files) {
  return files.filter((file) => WATCHED_PATTERNS.some((p) => p.test(file)));
}

/**
 * Decide the outcome from already-gathered facts, so the rule itself is
 * testable without a git repository.
 */
export function evaluate({ changedFiles = [], baseVersion, headVersion }) {
  const triggers = watchedChanges(changedFiles);

  if (headVersion === null || headVersion === undefined) {
    return {
      ok: false,
      message: `Could not find \`const VERSION = "…"\` in ${SW_PATH}.`,
    };
  }

  if (!/^v\d+$/.test(headVersion)) {
    return {
      ok: false,
      message: `${SW_PATH} has VERSION "${headVersion}"; the convention is v1, v2, v3…`,
    };
  }

  if (triggers.length === 0) {
    return {
      ok: true,
      message: "No built-asset sources changed; no cache version bump required.",
    };
  }

  const changedList = triggers.map((f) => `  - ${f}`).join("\n");

  if (baseVersion === headVersion) {
    return {
      ok: false,
      triggers,
      message:
        `These files change the built asset hashes the service worker caches:\n${changedList}\n\n` +
        `So ${SW_PATH} must bump its cache version, and it is still "${headVersion}".\n` +
        `Without the bump, a phone that already has the site installed keeps ` +
        `serving the old shell, which points at bundle filenames this deploy ` +
        `no longer publishes.\n\n` +
        `Fix: edit ${SW_PATH} and set VERSION to "v${Number(headVersion.slice(1)) + 1}".`,
    };
  }

  if (
    /^v\d+$/.test(baseVersion || "") &&
    Number(headVersion.slice(1)) < Number(baseVersion.slice(1))
  ) {
    return {
      ok: false,
      triggers,
      message: `${SW_PATH} moved backwards: ${baseVersion} → ${headVersion}. Cache versions only go up.`,
    };
  }

  return {
    ok: true,
    triggers,
    message:
      `Built-asset sources changed:\n${changedList}\n` +
      `${SW_PATH} cache version: ${baseVersion ?? "unknown"} → ${headVersion}. Good.`,
  };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function resolveBaseRef(explicit) {
  const candidates = [
    explicit,
    process.env.SW_VERSION_BASE_REF,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
    "origin/main",
    "main",
  ].filter(Boolean);

  for (const ref of candidates) {
    const sha = tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (sha) return { ref, sha };
  }
  return null;
}

function main(argv) {
  const baseFlag = argv.indexOf("--base");
  const explicitBase = baseFlag === -1 ? null : argv[baseFlag + 1];
  const strict = argv.includes("--strict");

  const base = resolveBaseRef(explicitBase);
  if (!base) {
    const note =
      "check:sw-version — no base ref to compare against (tried --base, " +
      "SW_VERSION_BASE_REF, GITHUB_BASE_REF, origin/main, main).";
    if (strict) {
      console.error(`✗ ${note}`);
      return 1;
    }
    console.log(`• ${note} Skipping.`);
    return 0;
  }

  // Merge base, so a branch is judged on its own changes rather than on
  // everything that landed on main meanwhile. Diffing against the working
  // tree (not HEAD) means the check is useful before committing, too.
  const mergeBase = tryGit(["merge-base", base.sha, "HEAD"]) || base.sha;
  const diff = tryGit(["diff", "--name-only", mergeBase]);
  if (diff === null) {
    const note = `check:sw-version — could not diff against ${base.ref}.`;
    if (strict) {
      console.error(`✗ ${note}`);
      return 1;
    }
    console.log(`• ${note} Skipping.`);
    return 0;
  }

  const changedFiles = diff.split("\n").filter(Boolean);
  const baseSw = tryGit(["show", `${mergeBase}:${SW_PATH}`]);
  const headSw = readFileSync(new URL(`../${SW_PATH}`, import.meta.url), "utf8");

  const result = evaluate({
    changedFiles,
    baseVersion: parseCacheVersion(baseSw),
    headVersion: parseCacheVersion(headSw),
  });

  console.log(`check:sw-version (base ${base.ref} @ ${mergeBase.slice(0, 8)})`);
  console.log(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
  return result.ok ? 0 : 1;
}

// Only run when executed directly, so the helpers above stay importable.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
