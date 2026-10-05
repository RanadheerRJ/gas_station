/**
 * What the app calls its version.
 *
 * Every change reaches main as one merged pull request, and main is what gets
 * deployed — so the PR number identifies a build exactly, and it moves on its
 * own with every deploy. `vite.config.js` resolves it at build time (see
 * scripts/appVersion.mjs) and substitutes the constants below, so the value is
 * part of the bundle and still correct offline.
 *
 * package.json remains the fallback for a build with no pull request behind it
 * (a local branch, a source tarball), so the UI never shows a blank version.
 */
import packageJson from "../../package.json";

const definedPr = typeof __APP_PR__ === "undefined" ? null : __APP_PR__;
const definedVersion = typeof __APP_VERSION__ === "undefined" ? "" : __APP_VERSION__;
const definedLabel =
  typeof __APP_VERSION_LABEL__ === "undefined" ? "" : __APP_VERSION_LABEL__;

/** The pull request number behind this build, or null when there is none. */
export const APP_PR = typeof definedPr === "number" ? definedPr : null;

/** The bare version string: "49" for a PR build, "1.0.0" for a fallback. */
export const APP_VERSION = definedVersion || packageJson.version;

/** How the version is written for a person: "PR #49" or "v1.0.0". */
export const APP_VERSION_LABEL =
  definedLabel || (APP_PR ? `PR #${APP_PR}` : `v${packageJson.version}`);
