# PÉTRAV brand assets

One mark, drawn once: a blue fuel pump with a ₹ in its display, a fuel drop
on the body, a red nozzle and hose, and a clock overlapping the lower right.
Fuel + Money + Time. The wordmark is monoline geometry — no font dependency,
so it renders identically on every device and offline.

## Palette

| Role | Light | Dark |
| --- | --- | --- |
| Pump body, ₹, hour hand | `#063B8F` | `#1567D2` |
| Clock ring, ticks | `#0B5BC6` | `#5B9BF0` |
| Nozzle, minute hand, A crossbar | `#E31B23` | `#E31B23` |
| Base, hose | `#082B5C` | `#3E6FBF` |
| Display, clock face | `#FFFFFF` | `#FFFFFF` |
| Fuel drop (the only warm accent) | `#F5A623` | `#F5A623` |

The interface copy of this table is the `--petrav-*` token block in
`src/styles.css`, which `src/components/branding.jsx` reads directly — that
is how the same artwork re-themes for dark mode without a second file.

## Files and where they are used

| File | Variant | Used for |
| --- | --- | --- |
| `petrav-logo.svg` | Full lockup (mark above wordmark) | Login/splash/marketing |
| `petrav-logo-horizontal.svg` | `[mark] PÉTRAV` | Headers, navigation |
| `petrav-icon.svg` | Mark only, transparent | General use on any background |
| `petrav-icon-monochrome.svg` | Line art, `currentColor` | Print, dark surfaces, single-colour UI states |
| `petrav-icon-maskable.svg` | Full-bleed, safe-zone art | Android adaptive/maskable icons |
| `petrav-apple-touch.svg` | Full-bleed square, no text | iOS home-screen icon (shipped as PNG) |
| `petrav-loading.svg` | Self-animated full lockup | Loading states (SVG + CSS, no GIF) |

The shipped PWA set in `public/` is derived from these:
`favicon.svg` (simplified pump only — the clock and nozzle do not survive a
browser tab), `favicon.ico`, `icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png`, and `logo.svg` (the
rounded-square tile the manifest references).

## Regenerating

Every file above is emitted by one script so the geometry can never drift:

```bash
node scripts/branding/build-branding.mjs            # SVG masters
npm i --no-save sharp
node scripts/branding/build-branding.mjs            # + PNGs and favicon.ico
```

`src/components/branding.jsx` mirrors the same paths for the live app (it
needs animation classes and CSS-variable theming, which static files cannot
carry). If you change the mark, change both — the header comment in each
points at the other.
