#!/usr/bin/env node
/**
 * Guard: the installable-app (PWA) surface must stay deployable on iOS and
 * Android.
 *
 * Installability is a contract spread over four files — the web app
 * manifest, the PNG icons and iOS splash screens in `public/`, the <meta>
 * and <link> tags in `index.html`, and the service worker — and no single
 * one of them fails loudly when another drifts. A renamed icon, a splash
 * link pointing at a file that was never generated, or a manifest icon
 * whose real pixels no longer match its declared `sizes` all ship silently
 * and only surface as "the install button does nothing" on a phone.
 *
 * This check reads the shipped files and verifies the whole contract:
 *
 *   1. The manifest parses and carries the fields Android requires
 *      (name/short_name, start_url, scope, standalone display, and PNG
 *      icons at 192 and 512 plus a 512 maskable).
 *   2. Every manifest icon exists, and its actual PNG dimensions match
 *      the declared `sizes`.
 *   3. `index.html` carries the install meta tags for both platforms and
 *      links the manifest and the 180px Apple touch icon.
 *   4. Every `apple-touch-startup-image` link resolves to a generated
 *      splash PNG whose dimensions match its filename, its media query
 *      names a device size, and no splash file on disk is left unlinked
 *      (an unlinked splash is a duplicate nobody can reach).
 *   5. The service worker still declares a `vN` cache version.
 *
 * Usage:  node scripts/checkPwa.mjs        (also `npm run check:pwa`)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(ROOT, "public");

/** Width/height from a PNG's IHDR, or null when the bytes are not a PNG. */
export function pngSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return null;
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Problems with a parsed manifest; an empty list means installable. */
export function manifestProblems(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== "object") return ["manifest is not an object"];
  for (const field of ["name", "short_name", "start_url", "scope", "theme_color"]) {
    if (!manifest[field]) problems.push(`manifest is missing "${field}"`);
  }
  if (manifest.display !== "standalone" && manifest.display !== "fullscreen") {
    problems.push('manifest "display" must be "standalone" (or "fullscreen")');
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  if (!icons.length) problems.push("manifest declares no icons");
  const pngAt = (size, purpose) =>
    icons.some(
      (icon) =>
        icon.type === "image/png" &&
        String(icon.sizes || "").includes(size) &&
        String(icon.purpose || "any").includes(purpose)
    );
  if (!pngAt("192x192", "any"))
    problems.push('manifest needs a 192x192 PNG icon ("any")');
  if (!pngAt("512x512", "any"))
    problems.push('manifest needs a 512x512 PNG icon ("any")');
  if (!pngAt("512x512", "maskable")) {
    problems.push('manifest needs a 512x512 PNG icon ("maskable") for Android');
  }
  return problems;
}

/** The iOS splash links in an HTML document: [{ href, media }] in order. */
export function splashLinks(html) {
  const links = [];
  const tagPattern = /<link\b[^>]*rel="apple-touch-startup-image"[^>]*>/g;
  for (const match of String(html || "").matchAll(tagPattern)) {
    const tag = match[0];
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1] || "";
    const media = /\bmedia="([^"]+)"/.exec(tag)?.[1] || "";
    links.push({ href, media });
  }
  return links;
}

/** Problems with the install surface of an HTML document. */
export function indexHtmlProblems(html) {
  const text = String(html || "");
  const problems = [];
  const required = [
    ['rel="manifest"', "the web app manifest <link>"],
    ["apple-touch-icon", "the Apple touch icon <link> (iOS home-screen icon)"],
    ['name="mobile-web-app-capable"', 'the "mobile-web-app-capable" meta (Android)'],
    [
      'name="apple-mobile-web-app-capable"',
      'the "apple-mobile-web-app-capable" meta (iOS)',
    ],
    ['name="theme-color"', 'the "theme-color" meta'],
    ["viewport-fit=cover", '"viewport-fit=cover" (notch / safe-area support)'],
  ];
  for (const [needle, label] of required) {
    if (!text.includes(needle)) problems.push(`index.html is missing ${label}`);
  }
  if (!splashLinks(text).length) {
    problems.push("index.html links no apple-touch-startup-image splash screens (iOS)");
  }
  return problems;
}

/** "splash-1170x2532.png" → { width: 1170, height: 2532 }, else null. */
export function splashSizeFromName(name) {
  const match = /^splash-(\d+)x(\d+)\.png$/.exec(String(name || ""));
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function main() {
  const problems = [];

  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8"));
  } catch (error) {
    problems.push(`manifest.webmanifest does not parse: ${error.message}`);
  }
  if (manifest) {
    problems.push(...manifestProblems(manifest));
    for (const icon of manifest.icons || []) {
      if (icon.type !== "image/png") continue;
      const file = join(PUBLIC, icon.src);
      if (!existsSync(file)) {
        problems.push(`manifest icon "${icon.src}" does not exist in public/`);
        continue;
      }
      const actual = pngSize(readFileSync(file));
      const declared = splashSizeFromName(`splash-${icon.sizes}.png`) || {
        width: Number(String(icon.sizes).split("x")[0]),
        height: Number(String(icon.sizes).split("x")[1]),
      };
      if (!actual) {
        problems.push(`manifest icon "${icon.src}" is not a PNG`);
      } else if (actual.width !== declared.width || actual.height !== declared.height) {
        problems.push(
          `manifest icon "${icon.src}" declares ${icon.sizes} but is ` +
            `${actual.width}x${actual.height}`
        );
      }
    }
  }

  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  problems.push(...indexHtmlProblems(html));

  const linkedSplashes = new Set();
  for (const { href, media } of splashLinks(html)) {
    const name = href.split("/").pop();
    linkedSplashes.add(name);
    const expected = splashSizeFromName(name);
    if (!expected) {
      problems.push(`splash link "${href}" is not named splash-<width>x<height>.png`);
      continue;
    }
    if (!/device-width:\s*\d+px/.test(media) || !/device-height:\s*\d+px/.test(media)) {
      problems.push(`splash link "${href}" has no device size in its media query`);
    }
    const file = join(PUBLIC, "splash", name);
    if (!existsSync(file)) {
      problems.push(`splash link "${href}" has no file at public/splash/${name}`);
      continue;
    }
    const actual = pngSize(readFileSync(file));
    if (!actual || actual.width !== expected.width || actual.height !== expected.height) {
      problems.push(
        `public/splash/${name} is ${actual ? `${actual.width}x${actual.height}` : "not a PNG"}` +
          ` but its name promises ${expected.width}x${expected.height}`
      );
    }
  }
  const splashDir = join(PUBLIC, "splash");
  if (existsSync(splashDir)) {
    for (const name of readdirSync(splashDir)) {
      if (name.endsWith(".png") && !linkedSplashes.has(name)) {
        problems.push(
          `public/splash/${name} is generated but never linked from index.html`
        );
      }
    }
  }

  const sw = readFileSync(join(PUBLIC, "sw.js"), "utf8");
  if (!/const\s+VERSION\s*=\s*"v\d+"/.test(sw)) {
    problems.push('public/sw.js does not declare a `const VERSION = "vN"` cache version');
  }

  if (problems.length) {
    console.error("check:pwa — the installable-app surface is not deployable:");
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }
  console.log(
    "✓ check:pwa — manifest, icons, iOS splash screens, install meta and " +
      "service worker are all in step."
  );
  return 0;
}

// Only run when executed directly, so the helpers above stay importable.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
