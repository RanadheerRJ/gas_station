/**
 * PÉTRAV brand artwork for the interface.
 *
 * Everything is inline SVG on the same 96-unit grid as the master files in
 * src/assets/branding/, so the app bar, the sidebar, the login card and the
 * boot screen all draw the identical mark with zero network requests — this
 * is a PWA that has to feel instant on a slow connection.
 *
 * The colours are CSS custom properties (see styles.css) with hard-coded
 * fallbacks, so the mark re-themes for dark mode without a second asset and
 * still renders correctly anywhere the stylesheet has not loaded. Geometry
 * changes must be mirrored in scripts/branding/build-branding.mjs, which
 * regenerates the favicon, PWA and maskable icons from the same paths.
 */

import { useLanguage } from "../state/LanguageContext.jsx";

/* The mark: a fuel pump with a ₹ display, a fuel drop, a red nozzle and
   hose, and a clock overlapping the lower right — Fuel + Money + Time. */
const GEO = {
  rupee: "M28 20V37M28 22.5H48M28 26.5H48M28.5 26L46.5 37.5",
  drop: "M38 50.5C40.8 54.8 42.6 57.4 42.6 59.6A4.6 4.6 0 1 1 33.4 59.6C33.4 57.4 35.2 54.8 38 50.5Z",
  hose: "M64 22.5C74.5 22.5 77 26 77 33",
  spout: "M75.5 41L71.8 48.5",
  ticks: "M69.5 58.5V61.3M81.5 70.5H78.7M69.5 82.5V79.7M57.5 70.5H60.3",
  hour: "M69.5 70.5L63.6 67.1",
  minute: "M69.5 70.5L78.3 65.4",
};

/* The wordmark: PÉTRAV as monoline geometry — no font dependency, so it is
   pixel-identical on every device and offline. The A carries the red bar. */
const WORDMARK = {
  letters:
    "M6.5 57.5V6.5H20.5Q32.5 6.5 32.5 19.75Q32.5 32.5 20.5 32.5H6.5" +
    "M80 6.5H59.5V57.5H80M59.5 31.75H77" +
    "M107 6.5H134M120.5 6.5V57.5" +
    "M161 57.5V6.5H174.5Q186 6.5 186 19.5Q186 31.5 174.5 31.5H161M174 31.5L187.5 57.5" +
    "M214.5 57.5L228 6.5L241.5 57.5" +
    "M268.5 6.5L281.75 57.5L295 6.5",
  accent: "M62.5 -5.5L74 -12",
  crossbar: "M219 40.5H237",
  width: 301.5,
  height: 80.5,
};

const ASPECT = WORDMARK.width / WORDMARK.height;

/** A themed colour from the stylesheet, with the brand fallback baked in. */
function tone(name, fallback, mono) {
  return mono ? "currentColor" : `var(--petrav-${name}, ${fallback})`;
}

/**
 * The icon on its own: pump, ₹, drop, nozzle, clock.
 *
 * `label` marks it as meaningful content (role="img" + title); without it
 * the mark is decorative and hidden from assistive technology — pass a
 * label only where it is the only thing naming the brand on screen.
 */
export function PetravMark({ size = 28, mono = false, label, className = "" }) {
  const c = (name, fallback) => tone(name, fallback, mono);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className || undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {/* pump assembly: base, body, display, ₹, drop, hose, nozzle */}
      <g className="pm-pump">
        <rect x="7" y="74" width="62" height="9" rx="4.5" fill={c("base", "#082B5C")} />
        <rect x="12" y="8" width="52" height="66" rx="9" fill={c("pump", "#063B8F")} />
        <rect
          x="20"
          y="16"
          width="36"
          height="25"
          rx="5"
          fill={c("display", "#FFFFFF")}
        />
        <g className="pm-rupee">
          <path
            d={GEO.rupee}
            fill="none"
            stroke={c("rupee", "#063B8F")}
            strokeWidth="3.3"
            strokeLinecap="round"
          />
        </g>
        <path className="pm-drop" d={GEO.drop} fill={c("drop", "#F5A623")} />
        <path
          d={GEO.hose}
          fill="none"
          stroke={c("base", "#082B5C")}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <rect
          x="73.5"
          y="33"
          width="9"
          height="8.5"
          rx="2.2"
          fill={c("nozzle", "#E31B23")}
        />
        <path
          d={GEO.spout}
          fill="none"
          stroke={c("nozzle", "#E31B23")}
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </g>
      {/* clock: white face, blue ring, blue hour hand, red minute hand */}
      <g className="pm-clock">
        <circle
          cx="69.5"
          cy="70.5"
          r="15.5"
          fill={c("clock-face", "#FFFFFF")}
          stroke={c("clock-ring", "#0B5BC6")}
          strokeWidth="4"
        />
        <path
          d={GEO.ticks}
          fill="none"
          stroke={c("clock-ring", "#0B5BC6")}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d={GEO.hour}
          fill="none"
          stroke={c("clock-hour", "#063B8F")}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          className="pm-hand"
          d={GEO.minute}
          fill="none"
          stroke={c("red", "#E31B23")}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="69.5" cy="70.5" r="1.7" fill={c("clock-hour", "#063B8F")} />
      </g>
    </svg>
  );
}

/**
 * The PÉTRAV wordmark. Strokes `currentColor` so it follows the text colour
 * of wherever it sits (near-black in light theme, near-white in dark);
 * `mono` also flattens the red A bar for single-colour contexts.
 */
export function PetravWordmark({ height = 16, mono = false, className = "" }) {
  const red = tone("red", "#E31B23", mono);
  return (
    <svg
      width={Math.round(height * ASPECT)}
      height={height}
      viewBox={`0 -16.5 ${WORDMARK.width} ${WORDMARK.height}`}
      className={className || undefined}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={WORDMARK.letters}
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={WORDMARK.accent}
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d={WORDMARK.crossbar}
        fill="none"
        stroke={red}
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The horizontal lockup — [mark] PÉTRAV — for the app bar and the desktop
 * sidebar. One accessible name for the whole group; the parts are decorative.
 */
export function PetravLockup({ markSize = 26, wordHeight = 15, label = "PÉTRAV" }) {
  return (
    <div className="brand-lockup" role="img" aria-label={label}>
      <PetravMark size={markSize} />
      <PetravWordmark height={wordHeight} />
    </div>
  );
}

/**
 * The boot screen: the mark draws itself in (pump rises, ₹ lights up, drop
 * settles, clock runs) while the wordmark and subtitle fade in behind it —
 * then a small blue/red sweep holds the eye while the session is checked.
 * The choreography lives in styles.css, keyed off the `pm-*` classes above,
 * and collapses to a static logo under prefers-reduced-motion.
 */
export function PetravBoot() {
  const { t } = useLanguage();
  return (
    <div className="boot" role="status" aria-busy="true">
      <PetravMark size={88} label="PÉTRAV" className="boot__mark" />
      <PetravWordmark height={26} className="boot__word" />
      <div className="boot__sub">{t("app.subtitle")}</div>
      <div className="boot__bar" aria-hidden="true" />
      <p className="boot__loading">{t("common.loading")}…</p>
    </div>
  );
}
