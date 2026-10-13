import { SHIFT_STATUS } from "../../lib/shiftMath";

/**
 * The shift list's four shelves.
 *
 * A forecourt does not want "every shift, newest first": the person opening
 * the screen is either watching what is running, clearing what needs their
 * sign-off, or looking back at what is done. Those are three different
 * questions, so they get three tabs — plus "All" for the roll-up — and each
 * one carries its own count so the queue is visible before it is opened.
 */
export const SHIFT_TAB = {
  ALL: "all",
  LIVE: "live",
  REVIEW: "review",
  CLOSED: "closed",
};

/**
 * Which shelf a shift belongs on.
 *
 * A sent-back shift is closed in the database but not finished with — it is
 * waiting on somebody — so it files under review, where the action is, rather
 * than under closed, where nothing more will happen to it.
 */
export function shiftBucket(shift) {
  const status = shift?.status;
  if (status === SHIFT_STATUS.OPEN) return SHIFT_TAB.LIVE;
  if (status === SHIFT_STATUS.APPROVED) return SHIFT_TAB.CLOSED;
  return SHIFT_TAB.REVIEW;
}

/** How many shifts sit on each shelf. */
export function bucketCounts(shifts) {
  const counts = { all: 0, live: 0, review: 0, closed: 0 };
  (shifts || []).forEach((shift) => {
    counts.all += 1;
    counts[shiftBucket(shift)] += 1;
  });
  return counts;
}

/**
 * The shifts on one shelf.
 *
 * "All" keeps the running shifts at the top: what is happening now is the
 * first thing anybody opening this screen needs, and a live shift buried
 * under last week's history is a shift nobody noticed was still open.
 */
export function filterShifts(shifts, bucket) {
  const rows = shifts || [];
  if (bucket === SHIFT_TAB.ALL) {
    return [...rows].sort((a, b) => {
      const aLive = shiftBucket(a) === SHIFT_TAB.LIVE ? 0 : 1;
      const bLive = shiftBucket(b) === SHIFT_TAB.LIVE ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return startedAt(b) - startedAt(a);
    });
  }
  return rows.filter((shift) => shiftBucket(shift) === bucket);
}

function startedAt(shift) {
  const value = shift?.startTime;
  const time = value?.toDate ? value.toDate() : new Date(value);
  return Number.isFinite(time?.getTime?.()) ? time.getTime() : 0;
}

/* ---- Prompt 8: per-status filters + date presets (ShiftsList) ---- */

export const STATUS_FILTER = {
  ALL: "all",
  RUNNING: "running",
  PENDING: "pending",
  SENT_BACK: "sent_back",
  APPROVED: "approved",
};

export function statusFilterOf(shift) {
  const s = shift?.status;
  if (s === SHIFT_STATUS.OPEN) return STATUS_FILTER.RUNNING;
  if (s === SHIFT_STATUS.PENDING_REVIEW) return STATUS_FILTER.PENDING;
  if (s === SHIFT_STATUS.REJECTED) return STATUS_FILTER.SENT_BACK;
  if (s === SHIFT_STATUS.APPROVED) return STATUS_FILTER.APPROVED;
  return STATUS_FILTER.PENDING;
}

export function statusCounts(shifts) {
  const counts = { all: 0, running: 0, pending: 0, sent_back: 0, approved: 0 };
  (shifts || []).forEach((shift) => {
    counts.all += 1;
    counts[statusFilterOf(shift)] += 1;
  });
  return counts;
}

export function filterByStatus(shifts, filter) {
  const rows = [...(shifts || [])].sort((a, b) => startedAt(b) - startedAt(a));
  if (!filter || filter === STATUS_FILTER.ALL) return rows;
  return rows.filter((shift) => statusFilterOf(shift) === filter);
}

export function statusFilterDefs(t, counts) {
  return [
    { id: STATUS_FILTER.ALL, label: t("shifts.tabAll"), count: counts.all },
    { id: STATUS_FILTER.RUNNING, label: t("shifts.tabRunning"), count: counts.running },
    {
      id: STATUS_FILTER.PENDING,
      label: t("shifts.pendingReview"),
      count: counts.pending,
    },
    { id: STATUS_FILTER.SENT_BACK, label: t("shifts.sentBack"), count: counts.sent_back },
    { id: STATUS_FILTER.APPROVED, label: t("shifts.approved"), count: counts.approved },
  ];
}

export const DATE_PRESET = {
  ALL: "all",
  TODAY: "today",
  YESTERDAY: "yesterday",
  LAST7: "last7",
  MONTH: "month",
  CUSTOM: "custom",
};

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Inclusive {from,to} ISO range for a preset; null = no date filtering. */
export function presetRange(preset, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = 86400000;
  switch (preset) {
    case DATE_PRESET.TODAY:
      return { from: isoOf(today), to: isoOf(today) };
    case DATE_PRESET.YESTERDAY: {
      const y = new Date(today.getTime() - day);
      return { from: isoOf(y), to: isoOf(y) };
    }
    case DATE_PRESET.LAST7:
      return { from: isoOf(new Date(today.getTime() - 6 * day)), to: isoOf(today) };
    case DATE_PRESET.MONTH:
      return {
        from: isoOf(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: isoOf(today),
      };
    default:
      return null;
  }
}

export function shiftInRange(shift, range) {
  if (!range) return true;
  const date = shift?.date || isoOf(new Date(startedAt(shift)));
  return date >= range.from && date <= range.to;
}

/** Group shifts (already sorted newest-first) under their shift date, newest date first. */
export function groupShiftsByDate(shifts) {
  const groups = new Map();
  for (const shift of shifts || []) {
    const key = shift?.date || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shift);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

/**
 * The tab row, with counts.
 *
 * `showLive` is off for the attendant's own history: attendants cannot see
 * anybody else's running shift, and their own running shift is on Today, not
 * filed under the past.
 */
export function shiftTabDefs(t, counts, { showLive = true } = {}) {
  const defs = [{ id: SHIFT_TAB.ALL, label: t("shifts.tabAll"), count: counts.all }];
  if (showLive) {
    defs.push({
      id: SHIFT_TAB.LIVE,
      label: t("shifts.tabLive"),
      count: counts.live,
      tone: "live",
    });
  }
  defs.push({
    id: SHIFT_TAB.REVIEW,
    label: t("shifts.tabReview"),
    count: counts.review,
    tone: "review",
  });
  defs.push({ id: SHIFT_TAB.CLOSED, label: t("shifts.tabClosed"), count: counts.closed });
  return defs;
}

/**
 * A row of filter tabs that stays on screen while the list scrolls under it
 * — the way a delivery app keeps its category bar within thumb's reach.
 *
 * The count is part of the label rather than decoration: "Review 3" is a
 * queue, and a queue is worth opening.
 */
export default function ShiftTabs({ tabs, value, onChange, label }) {
  return (
    <div className="shift-tabs">
      <div className="shift-tabs__row" role="tablist" aria-label={label}>
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-tone={tab.tone || undefined}
              className={`shift-tab${active ? " shift-tab--active" : ""}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.tone === "live" && tab.count > 0 && (
                <span className="shift-tab__dot" aria-hidden="true" />
              )}
              <span className="shift-tab__label">{tab.label}</span>
              <span className="shift-tab__count">{tab.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
