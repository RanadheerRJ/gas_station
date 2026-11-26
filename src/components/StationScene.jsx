import { memo } from "react";

/**
 * A small decorative forecourt scene for the balance hero cards: a tilted
 * canopy with a fuel-red fascia stripe, two pumps and a soft ground shadow,
 * drawn on a 220×120 grid. Original PÉTRAV artwork — every fill is a theme
 * token, so the scene sits on the light sky card in the light theme and
 * dims into the deep gradient in the dark theme (see `.buddy-balance__scene`
 * / `.hero-card__scene` opacity in home.css).
 *
 * Purely decorative: hidden from assistive technology, never interactive.
 */
const StationScene = memo(function StationScene({ className = "" }) {
  return (
    <svg
      viewBox="0 0 220 120"
      className={className || undefined}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMaxYMax meet"
    >
      {/* clouds */}
      <g fill="var(--surface)" opacity="0.75">
        <ellipse cx="38" cy="22" rx="17" ry="7" />
        <ellipse cx="52" cy="17" rx="12" ry="6" />
        <ellipse cx="178" cy="12" rx="15" ry="6" />
        <ellipse cx="192" cy="8" rx="10" ry="5" />
      </g>

      {/* ground shadow */}
      <ellipse cx="118" cy="106" rx="96" ry="9" fill="var(--accent)" opacity="0.14" />

      {/* canopy: tilted roof, red fascia, shaded underside */}
      <polygon points="34,32 196,20 206,34 44,46" fill="var(--accent)" />
      <polygon
        points="34,32 196,20 197.5,25 35.5,37"
        fill="var(--petrav-nozzle)"
        opacity="0.9"
      />
      <polygon
        points="44,46 206,34 206,39 44,51"
        fill="var(--accent-strong)"
        opacity="0.55"
      />

      {/* round brand sign on the roof edge */}
      <circle cx="120" cy="27" r="10" fill="var(--surface)" />
      <circle
        cx="120"
        cy="27"
        r="10"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
      />
      <path
        d="M120 21.5c2.6 2.4 3.9 4.4 3.9 6.2a3.9 3.9 0 0 1-7.8 0c0-1.8 1.3-3.8 3.9-6.2Z"
        fill="var(--accent)"
      />

      {/* posts */}
      <g fill="var(--hairline-strong)">
        <rect x="60" y="50" width="7" height="52" rx="2" />
        <rect x="172" y="42" width="7" height="60" rx="2" />
      </g>

      {/* pumps */}
      <g>
        <rect
          x="86"
          y="66"
          width="22"
          height="36"
          rx="3.5"
          fill="var(--surface)"
          stroke="var(--hairline-strong)"
          strokeWidth="1.4"
        />
        <rect
          x="90"
          y="71"
          width="14"
          height="9"
          rx="2"
          fill="var(--accent-soft-strong)"
        />
        <rect
          x="90"
          y="84"
          width="14"
          height="3"
          rx="1.5"
          fill="var(--hairline-strong)"
        />
        <rect x="90" y="90" width="9" height="3" rx="1.5" fill="var(--hairline-strong)" />

        <rect
          x="132"
          y="60"
          width="22"
          height="42"
          rx="3.5"
          fill="var(--surface)"
          stroke="var(--hairline-strong)"
          strokeWidth="1.4"
        />
        <rect
          x="136"
          y="65"
          width="14"
          height="9"
          rx="2"
          fill="var(--accent-soft-strong)"
        />
        <rect
          x="136"
          y="78"
          width="14"
          height="3"
          rx="1.5"
          fill="var(--hairline-strong)"
        />
        <rect
          x="136"
          y="84"
          width="9"
          height="3"
          rx="1.5"
          fill="var(--hairline-strong)"
        />
        <path
          d="M154 70c4 1.5 5.5 4 5.5 8v14"
          fill="none"
          stroke="var(--petrav-nozzle)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
});

export default StationScene;
