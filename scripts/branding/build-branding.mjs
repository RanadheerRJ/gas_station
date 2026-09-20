/*
 * PÉTRAV brand asset generator.
 *
 * One place holds the mark's geometry; every shipped asset is derived from
 * it, so the favicon, the PWA icons, the maskable icon and the master SVGs
 * can never drift apart.
 *
 *   node scripts/branding/build-branding.mjs          → SVG masters only
 *   npm i --no-save sharp && node …build-branding.mjs  → also PNGs + favicon.ico
 *
 * The React components in src/components/branding.jsx mirror this geometry
 * (they need live classes and CSS-variable theming, which files cannot
 * carry); if you change anything here, change it there too. The reverse is
 * documented over there as well.
 *
 * Design: a single fuel pump with a ₹ display, a fuel drop on the body, a
 * red nozzle and hose, and a clock overlapping the lower right — Fuel +
 * Money + Time. Blue/red/white per the Indian fuel-retail palette, with one
 * small amber drop as the only warm accent.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BRANDING_DIR = join(ROOT, "src", "assets", "branding");
const PUBLIC_DIR = join(ROOT, "public");

/* ---- palette (see src/assets/branding/README.md) ---- */
const C = {
  blue: "#063B8F", // primary — pump body, ₹, hour hand
  blue2: "#0B5BC6", // secondary — clock ring, ticks
  red: "#E31B23", // accent — nozzle, minute hand, A crossbar
  navy: "#082B5C", // dark — base, hose
  white: "#FFFFFF",
  amber: "#F5A623", // the one warm accent: the fuel drop
  ink: "#082B5C", // wordmark
};

/* =====================================================================
 * THE MARK — everything drawn on a 96×96 grid, centred around (47, 48).
 * ===================================================================== */

const GEOMETRY = {
  base: '<rect x="7" y="74" width="62" height="9" rx="4.5"/>',
  body: '<rect x="12" y="8" width="52" height="66" rx="9"/>',
  display: '<rect x="20" y="16" width="36" height="25" rx="5"/>',
  rupee:
    '<path d="M28 20V37M28 22.5H48M28 26.5H48M28.5 26L46.5 37.5" fill="none" stroke-linecap="round"/>',
  drop: '<path d="M38 50.5C40.8 54.8 42.6 57.4 42.6 59.6A4.6 4.6 0 1 1 33.4 59.6C33.4 57.4 35.2 54.8 38 50.5Z"/>',
  hose: '<path d="M64 22.5C74.5 22.5 77 26 77 33" fill="none" stroke-linecap="round"/>',
  nozzleHandle: '<rect x="73.5" y="33" width="9" height="8.5" rx="2.2"/>',
  nozzleSpout: '<path d="M75.5 41L71.8 48.5" fill="none" stroke-linecap="round"/>',
  clockFace: '<circle cx="69.5" cy="70.5" r="15.5"/>',
  clockTicks:
    '<path d="M69.5 58.5V61.3M81.5 70.5H78.7M69.5 82.5V79.7M57.5 70.5H60.3" fill="none" stroke-linecap="round"/>',
  clockHour: '<path d="M69.5 70.5L63.6 67.1" fill="none" stroke-linecap="round"/>',
  clockMinute: '<path d="M69.5 70.5L78.3 65.4" fill="none" stroke-linecap="round"/>',
  clockHub: '<circle cx="69.5" cy="70.5" r="1.7"/>',
};

/** The full-colour mark, 96-grid, painted in the order given above. */
function markColor(prefix = "") {
  /* `prefix` names the animation hooks — the React copy uses "pm-", the
     standalone loading file "pl-". Without it the static masters carry
     no classes at all. */
  const g = (name) => `${GEOMETRY[name]}`;
  const attr = (hook) => (prefix ? ` class="${prefix}${hook}"` : "");
  return [
    `<g${attr("pump")}>`,
    `<g fill="${C.navy}">${g("base")}</g>`,
    `<g fill="${C.blue}">${g("body")}</g>`,
    `<g fill="${C.white}">${g("display")}</g>`,
    `<g${attr("rupee")} stroke="${C.blue}" stroke-width="3.3">${g("rupee")}</g>`,
    `<g${attr("drop")} fill="${C.amber}">${g("drop")}</g>`,
    `<g stroke="${C.navy}" stroke-width="3.4">${g("hose")}</g>`,
    `<g fill="${C.red}">${g("nozzleHandle")}</g>`,
    `<g stroke="${C.red}" stroke-width="3.6">${g("nozzleSpout")}</g>`,
    `</g>`,
    `<g${attr("clock")}>`,
    `<g fill="${C.white}" stroke="${C.blue2}" stroke-width="4">${g("clockFace")}</g>`,
    `<g stroke="${C.blue2}" stroke-width="2.2">${g("clockTicks")}</g>`,
    `<g stroke="${C.blue}" stroke-width="3">${g("clockHour")}</g>`,
    `<g${attr("hand")} stroke="${C.red}" stroke-width="3">${g("clockMinute")}</g>`,
    `<g fill="${C.blue}">${g("clockHub")}</g>`,
    `</g>`,
  ].join("");
}

/** Single-colour line-art mark: strokes only, except the drop and hub. */
function markMono() {
  const g = GEOMETRY;
  return [
    `<g fill="none" stroke="currentColor" stroke-linecap="round">`,
    `<g stroke-width="4">${g.base}${g.body}${g.display}${g.clockFace}</g>`,
    `<g stroke-width="3.3">${g.rupee}</g>`,
    `<g stroke-width="3.4">${g.hose}</g>`,
    `<g stroke-width="3.5">${g.nozzleHandle}</g>`,
    `<g stroke-width="3.6">${g.nozzleSpout}</g>`,
    `<g stroke-width="2.2">${g.clockTicks}</g>`,
    `<g stroke-width="3">${g.clockHour}${g.clockMinute}</g>`,
    `</g>`,
    `<g fill="currentColor">${g.drop}${g.clockHub}</g>`,
  ].join("");
}

/* =====================================================================
 * THE WORDMARK — PÉTRAV as monoline geometry (no font dependency).
 * Cap height 64, stroke 13, round terminals. The A carries a red crossbar.
 * ===================================================================== */

const WORD = {
  letters:
    "M6.5 57.5V6.5H20.5Q32.5 6.5 32.5 19.75Q32.5 32.5 20.5 32.5H6.5" + // P
    "M80 6.5H59.5V57.5H80M59.5 31.75H77" + // É
    "M107 6.5H134M120.5 6.5V57.5" + // T
    "M161 57.5V6.5H174.5Q186 6.5 186 19.5Q186 31.5 174.5 31.5H161M174 31.5L187.5 57.5" + // R
    "M214.5 57.5L228 6.5L241.5 57.5" + // A
    "M268.5 6.5L281.75 57.5L295 6.5", // V
  accent: "M62.5 -5.5L74 -12", // the acute on É
  crossbar: "M219 40.5H237", // the red bar in the A
  width: 301.5,
  height: 80.5, // includes the accent above the cap height
};

/** The wordmark drawn around its own origin (x: 0..301.5, y: -16.5..64). */
function wordmark(ink = C.ink, red = C.red) {
  return [
    `<path d="${WORD.letters}" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${WORD.accent}" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>`,
    `<path d="${WORD.crossbar}" fill="none" stroke="${red}" stroke-width="13" stroke-linecap="round"/>`,
  ].join("");
}

/* =====================================================================
 * FILES
 * ===================================================================== */

const svg = (viewBox, body, { width, height, extra = "" } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${
    width ? ` width="${width}" height="${height}"` : ""
  } role="img" aria-label="PÉTRAV"${extra}>\n${body}\n</svg>\n`;

const FILES = {};

/* Variant B — icon only, transparent background (the master mark). */
FILES["petrav-icon.svg"] = svg("0 0 96 96", `<title>PÉTRAV</title>\n${markColor()}`, {
  width: 96,
  height: 96,
});

/* Variant D — monochrome, currentColor so it works in black or white. */
FILES["petrav-icon-monochrome.svg"] = svg(
  "0 0 96 96",
  `<title>PÉTRAV</title>\n${markMono()}`,
  { width: 96, height: 96 }
);

/* Maskable — full-bleed background, all artwork inside the 80% safe circle. */
FILES["petrav-icon-maskable.svg"] = svg(
  "0 0 512 512",
  `<title>PÉTRAV</title>\n<rect width="512" height="512" fill="${C.white}"/>\n` +
    `<g transform="translate(91.5 88) scale(3.5)">${markColor()}</g>`,
  { width: 512, height: 512 }
);

/* Variant A — full lockup: mark above the wordmark. */
FILES["petrav-logo.svg"] = svg(
  "0 0 320 196",
  `<title>PÉTRAV</title>\n<g transform="translate(112 0)">${markColor()}</g>\n` +
    `<g transform="translate(9.25 130.5)">${wordmark()}</g>`,
  { width: 320, height: 196 }
);

/* Variant C — horizontal lockup: mark beside the wordmark. */
FILES["petrav-logo-horizontal.svg"] = svg(
  "0 0 418 96",
  `<title>PÉTRAV</title>\n<g transform="translate(0 0)">${markColor()}</g>\n` +
    `<g transform="translate(116 24.25)">${wordmark()}</g>`,
  { width: 418, height: 96 }
);

/* The loading animation — the full lockup with the boot sequence baked in
 * as CSS. Self-contained: no scripts, no external references, so it also
 * animates when used straight from an <img>. */
FILES["petrav-loading.svg"] = svg(
  "0 0 320 196",
  `<title>PÉTRAV</title>\n<style>
.pl-pump{animation:pl-rise .5s cubic-bezier(.22,.61,.36,1) both}
.pl-clock{animation:pl-fade .45s .18s ease-out both}
.pl-rupee{animation:pl-light .45s .3s ease-out both}
.pl-drop{animation:pl-fade .4s .5s ease-out both,pl-pulse 1.6s 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.pl-hand{animation:pl-tick 3.2s linear infinite;transform-box:view-box;transform-origin:181.5px 70.5px}
.pl-word{animation:pl-fade .6s .85s ease-out both}
@keyframes pl-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes pl-fade{from{opacity:0}to{opacity:1}}
@keyframes pl-light{from{opacity:.15}to{opacity:1}}
@keyframes pl-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
@keyframes pl-tick{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.pl-pump,.pl-clock,.pl-rupee,.pl-drop,.pl-hand,.pl-word{animation:none}}
</style>
<g transform="translate(112 0)">${markColor("pl-")}</g>
<g class="pl-word" transform="translate(9.25 130.5)">${wordmark()}</g>`,
  { width: 320, height: 196 }
);

/* ---- public/ assets ---- */

/* The app icon tile: rounded square, light background, generous padding
 * (PWA "any" icon and the SVG favicon fallback). */
FILES["logo.svg"] = svg(
  "0 0 512 512",
  `<title>PÉTRAV</title>\n<rect width="512" height="512" rx="112" fill="${C.white}"/>\n` +
    `<g transform="translate(82.1 78.4) scale(3.7)">${markColor()}</g>`,
  { width: 512, height: 512 }
);

/* The favicon: only the simplified pump (the clock and nozzle do not
 * survive 16px), on the brand blue so it reads on any tab colour. */
FILES["favicon.svg"] =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" ` +
  `role="img" aria-label="PÉTRAV">\n<title>PÉTRAV</title>\n` +
  `<rect width="64" height="64" rx="13" fill="${C.blue}"/>\n` +
  `<g fill="${C.white}"><rect x="11" y="49" width="42" height="7" rx="3.5"/>` +
  `<rect x="16" y="8" width="32" height="41" rx="6"/></g>\n` +
  `<rect x="21.5" y="13.5" width="21" height="15" rx="3.5" fill="${C.blue}"/>\n` +
  `<path d="M26.5 16V25.5M26.5 18.3H37.5M26.5 21.3H37.5M27.5 21.3L36.5 25.3" ` +
  `fill="none" stroke="${C.white}" stroke-width="2.3" stroke-linecap="round"/>\n</svg>\n`;

/* Apple touch icon: full-bleed (iOS applies its own mask), no text. Only
   the rasterised PNG ships in public/; the SVG is the master. */
FILES["petrav-apple-touch.svg"] = svg(
  "0 0 180 180",
  `<title>PÉTRAV</title>\n<rect width="180" height="180" fill="${C.white}"/>\n` +
    `<g transform="translate(24.2 22.8) scale(1.4)">${markColor()}</g>`,
  { width: 180, height: 180 }
);

/* ---- write the SVGs ---- */

mkdirSync(BRANDING_DIR, { recursive: true });
for (const [name, body] of Object.entries(FILES)) {
  const dir = name.startsWith("petrav-") ? BRANDING_DIR : PUBLIC_DIR;
  writeFileSync(join(dir, name), body);
  console.log(`wrote ${join(dir, name).replace(ROOT + "/", "")}`);
}

/* ---- raster outputs (PWA + favicon), only when sharp is available ---- */

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log(
    "sharp not installed — skipping PNG/ICO rasterisation " +
      "(npm i --no-save sharp to include them)"
  );
}

if (sharp) {
  const png = async (source, size, out) => {
    const input =
      typeof source === "string" && source.endsWith(".svg")
        ? source
        : Buffer.from(source);
    await sharp(input, { density: 400 })
      .resize(size, size, { fit: "fill" })
      .png()
      .toFile(join(PUBLIC_DIR, out));
    console.log(`wrote public/${out}`);
  };

  await png(FILES["logo.svg"], 192, "icon-192.png");
  await png(FILES["logo.svg"], 512, "icon-512.png");
  await png(FILES["petrav-icon-maskable.svg"], 512, "icon-maskable-512.png");
  await png(FILES["petrav-apple-touch.svg"], 180, "apple-touch-icon.png");

  /* favicon.ico: 16/32/48 BMP entries (the universally-supported classic
   * form), built by hand so no extra dependency is needed. */
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(Buffer.from(FILES["favicon.svg"]))
        .resize(s, s)
        .raw()
        .toBuffer({ resolveWithObject: true })
    )
  );

  const entries = pngs.map(({ data, info }, i) => {
    const s = sizes[i];
    const bmp = bmpEntry(data, info.width, info.height);
    return { size: s, bmp };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = Buffer.alloc(entries.length * 16);
  entries.forEach((e, i) => {
    const base = i * 16;
    dir.writeUInt8(e.size, base);
    dir.writeUInt8(e.size, base + 1);
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3);
    dir.writeUInt16LE(1, base + 4); // planes
    dir.writeUInt16LE(32, base + 6); // bits
    dir.writeUInt32LE(e.bmp.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += e.bmp.length;
  });

  writeFileSync(
    join(PUBLIC_DIR, "favicon.ico"),
    Buffer.concat([header, dir, ...entries.map((e) => e.bmp)])
  );
  console.log("wrote public/favicon.ico");
}

/** Encode one RGBA frame as a bottom-up 32bpp BMP with an AND mask. */
function bmpEntry(rgba, width, height) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8); // XOR + AND masks
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = ((height - 1 - y) * width + x) * 4;
      const [r, g, b, a] = [rgba[src], rgba[src + 1], rgba[src + 2], rgba[src + 3]];
      pixels[dst] = b;
      pixels[dst + 1] = g;
      pixels[dst + 2] = r;
      pixels[dst + 3] = a;
    }
  }

  const maskRow = Math.ceil(width / 32) * 4;
  const mask = Buffer.alloc(maskRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha === 0) {
        const row = height - 1 - y;
        mask[row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, pixels, mask]);
}
