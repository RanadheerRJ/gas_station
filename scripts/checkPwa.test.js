/**
 * The PWA deployment contract, tested as a contract.
 *
 * The CLI reads the shipped files; the decisions it makes from their
 * contents are pure and pinned here, and the shipped files themselves are
 * asserted deployable so a drift is caught in CI, not on a phone.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  indexHtmlProblems,
  manifestProblems,
  pngSize,
  splashLinks,
  splashSizeFromName,
} from "./checkPwa.mjs";

const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8")
);
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const icon192 = readFileSync(new URL("../public/icon-192.png", import.meta.url));

describe("pngSize", () => {
  it("reads the real dimensions out of a shipped icon", () => {
    expect(pngSize(icon192)).toEqual({ width: 192, height: 192 });
  });

  it("refuses bytes that are not a PNG", () => {
    expect(pngSize(Buffer.from("<svg></svg>"))).toBeNull();
    expect(pngSize(Buffer.alloc(0))).toBeNull();
    expect(pngSize(null)).toBeNull();
  });
});

describe("manifestProblems", () => {
  it("passes the shipped manifest", () => {
    expect(manifestProblems(manifest)).toEqual([]);
  });

  it("fails a manifest Android cannot install", () => {
    expect(manifestProblems({})).toContain('manifest is missing "name"');
    expect(manifestProblems({ ...manifest, display: "browser" })).toContain(
      'manifest "display" must be "standalone" (or "fullscreen")'
    );
    expect(manifestProblems({ ...manifest, icons: [] })).toContain(
      "manifest declares no icons"
    );
  });
});

describe("the shipped index.html", () => {
  it("carries the install surface for both platforms", () => {
    expect(indexHtmlProblems(indexHtml)).toEqual([]);
  });

  it("links a named splash screen for every device class it targets", () => {
    const links = splashLinks(indexHtml);
    expect(links.length).toBeGreaterThanOrEqual(8);
    for (const { href, media } of links) {
      expect(splashSizeFromName(href.split("/").pop())).not.toBeNull();
      expect(media).toMatch(/device-width:\s*\d+px/);
      expect(media).toMatch(/device-height:\s*\d+px/);
    }
  });

  it("fails when the iOS install meta disappears", () => {
    const broken = indexHtml.replace('name="apple-mobile-web-app-capable"', 'name="x"');
    expect(indexHtmlProblems(broken).join(" ")).toMatch(/apple-mobile-web-app-capable/);
  });
});

describe("splashSizeFromName", () => {
  it("parses the generated filename convention", () => {
    expect(splashSizeFromName("splash-1170x2532.png")).toEqual({
      width: 1170,
      height: 2532,
    });
    expect(splashSizeFromName("icon-512.png")).toBeNull();
  });
});
