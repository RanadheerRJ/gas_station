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

/* ------------------------------------------------------------------ */
/* App-shell icons: navigation, sheets, and the small affordances the  */
/* consumer-style shell needs. Same 24-grid, same stroke weight.       */
/* ------------------------------------------------------------------ */

/** Home / today. */
export function HomeIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

/** A receipt with lines, for shift history. */
export function HistoryIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

/** A person, for the account tab and account button. */
export function UserIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/** Dots in a rounded square, for the "More" tab. */
export function MoreIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="8.2" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Right chevron, for tappable list rows. */
export function ChevronIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Left chevron, for back buttons. */
export function BackIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

/** Plus, for add actions. */
export function PlusIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Check, for selected states. */
export function CheckIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Cross, for closing sheets. */
export function CloseIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** An envelope, for the developer's invite screen. */
export function MailIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/** Sign-out door. */
export function LogOutIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" />
      <path d="M10 12h11" />
      <path d="M17.5 8.5L21 12l-3.5 3.5" />
    </svg>
  );
}

/** Download tray, for exports. */
export function DownloadIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v10" />
      <path d="M8 10.5l4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

/** A rising bar chart, for summaries. */
export function ChartIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V8M17 20v-10" />
    </svg>
  );
}

/** Sun, for switching to the light theme. */
export function SunIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
    </svg>
  );
}

/** Moon, for switching to the dark theme. */
export function MoonIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5z" />
    </svg>
  );
}

/** A globe, for the language control. */
export function GlobeIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5z" />
    </svg>
  );
}
