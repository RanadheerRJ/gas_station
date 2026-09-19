/**
 * Inline SVG icons, drawn on a 24-grid with 1.6px strokes to match the
 * hairline borders. Flat and monochrome by default — they inherit
 * currentColor so they sit inside headings and buttons without fuss.
 */

const base = (props) => ({
  width: props.size || 18,
  height: props.size || 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
  style: { flexShrink: 0, ...(props.style || {}) },
});

/** Fuel dispenser. */
export function PumpIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M3 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M2 21h13" />
      <path d="M5 9h6" />
      <path d="M17 8l2 2v7a2 2 0 0 0 2 2 1 1 0 0 0 1-1V9l-3-3" />
      <path d="M13 13h2" />
    </svg>
  );
}

/** Nozzle / hose. */
export function NozzleIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M7 21V7a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v14" />
      <path d="M5 21h11" />
      <path d="M14 10h4a2 2 0 0 1 2 2v3" />
      <circle cx="20" cy="17" r="1.6" />
    </svg>
  );
}

/** A clock face, for shifts. */
export function ShiftIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Price tag, for rates. */
export function RateIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

/** Stacked notes, for cash. */
export function CashIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="6" width="20" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </svg>
  );
}

/** Meter dial, for readings. */
export function GaugeIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function StationIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 21V4h10v17" />
      <path d="M2 21h20" />
      <path d="M7 8h4M7 12h4" />
      <path d="M17 21v-8h3v8" />
    </svg>
  );
}

export function PeopleIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 14.5A6 6 0 0 1 21 20" />
    </svg>
  );
}

export function LedgerIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z" />
      <path d="M5 17h14" />
      <path d="M9 7h6M9 11h6" />
    </svg>
  );
}

export function CreditIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

/** Small status dot used in shift rows. */
export function StatusDot({ tone = "green", title }) {
  const fill = tone === "green" ? "#15803d" : tone === "rust" ? "#dc2626" : "#b45309";
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <title>{title}</title>
      <circle cx="5" cy="5" r="4" fill={fill} />
    </svg>
  );
}

/** An underground storage tank, drawn side-on with a fill line. */
export function TankIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="6" width="18" height="12" rx="5" ry="6" />
      <path d="M3 13c2.5 1.4 5 1.4 7.5 0s5 -1.4 7.5 0 2.5 1.4 3 1.1" />
    </svg>
  );
}
