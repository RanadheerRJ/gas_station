/**
 * On-demand reporting: turn what a screen is already showing into a CSV or a
 * PDF the operator can hand to an accountant.
 *
 * Three rules shape this file:
 *
 *   1. It reads nothing. Every row handed to it has already come through
 *      `src/lib/api.js`, so row-level security has already decided what the
 *      signed-in account may see. There is no Supabase import here on purpose.
 *   2. It writes nothing. Reports are generated in the browser and downloaded;
 *      nothing is stored, so there is no saved-report table to secure.
 *   3. It is pure up to the final download call, so the escaping, the row
 *      building, the date filtering and the pagination are all unit-testable
 *      without a browser.
 *
 * Column headings are deliberately left in English even when the interface is
 * in Telugu or Hindi: a CSV is opened in a spreadsheet and a PDF is drawn with
 * the PDF standard fonts, neither of which can be relied on to carry Indic
 * text. The controls around the export are translated; the data interchange
 * format is not.
 */

import { formatDate, formatStamp } from "./format.js";
import { buildStatement } from "./statement.js";
import { classifyFuel, SHIFT_STATUS, shiftTotals } from "./shiftMath.js";
import { monthOf, shiftMonth } from "./reportMath.js";
import { tankStatus } from "./tankMath.js";

/** Everything this app exports is prefixed so downloads sort together. */
export const FILE_PREFIX = "petrav";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Two-decimal plain number: spreadsheet-safe, no thousands separators. */
export function decimal(value) {
  return num(value).toFixed(2);
}

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

/**
 * Quote one CSV field per RFC 4180.
 *
 * A comma would split the field, a newline would split the row, and a quote
 * would end the quoting early — so any of the three forces the field into
 * quotes, with inner quotes doubled. A leading or trailing space is also
 * quoted, because spreadsheets otherwise eat it.
 */
export function csvCell(value) {
  if (value == null) return "";
  const text = String(value);
  const needsQuotes =
    /[",\n\r]/.test(text) || text !== text.trim() || text.startsWith("=");
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Join a report into CSV text, headers first, CRLF line endings. */
export function toCsv({ columns = [], rows = [] } = {}) {
  const lines = [columns.map(csvCell).join(",")];
  rows.forEach((row) => lines.push(row.map(csvCell).join(",")));
  return lines.join("\r\n");
}

/* ------------------------------------------------------------------ */
/* Filenames                                                            */
/* ------------------------------------------------------------------ */

/**
 * A station's name reduced to a filename-safe token.
 *
 * Accents and punctuation go, spaces close up, and the result is capped so a
 * long trading name does not push the date range off the end of the filename:
 * "City Ctr" becomes "cityctr".
 */
export function stationSlug(name, maxLength = 14) {
  const cleaned = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return (cleaned || "station").slice(0, maxLength);
}

/** An ISO date, or today when the value is missing or unparseable. */
function isoOrToday(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Date().toISOString().slice(0, 10);
}

/**
 * `petrav-shifts-cityctr-2026-09-01_2026-09-19.csv`
 *
 * Station and date range are always present, so two downloads taken from
 * different stations or different periods never collide in a downloads folder.
 */
export function reportFilename({
  report,
  stationName,
  from,
  to,
  extension = "csv",
  fuelGroup = "",
  employeeName = "",
} = {}) {
  const slug = stationSlug(stationName);
  const start = isoOrToday(from);
  const end = isoOrToday(to);
  const scope = [fuelGroup, employeeName]
    .filter(Boolean)
    .map((value) => stationSlug(value, 24));
  const kind = String(report || "report").replace(/[^a-z0-9]+/gi, "-");
  return `${FILE_PREFIX}-${kind}-${slug}${scope.length ? `-${scope.join("-")}` : ""}-${start}_${end}.${extension}`;
}

/* ------------------------------------------------------------------ */
/* Date range                                                           */
/* ------------------------------------------------------------------ */

/** The ISO day part of a date, a timestamp, or a Date. */
export function isoDay(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/** Inclusive on both ends; an empty bound means "unbounded that way". */
export function inRange(value, { from, to } = {}) {
  const day = isoDay(value);
  if (!day) return false;
  if (from && day < isoDay(from)) return false;
  if (to && day > isoDay(to)) return false;
  return true;
}

/**
 * Filter any collection by the active range.
 *
 * The screen and its export both run through this, which is what keeps a
 * downloaded file identical to the rows on display.
 */
export function filterByRange(items = [], range = {}, accessor = (item) => item.date) {
  if (!range?.from && !range?.to) return [...items];
  return items.filter((item) => inRange(accessor(item), range));
}

/** The month-to-date window every screen opens on. */
export function defaultRange(today = new Date()) {
  const to = today.toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

/**
 * The calendar window of a "YYYY-MM" key, as an inclusive ISO range.
 *
 * Used where a screen already knows the month it is showing — the monthly
 * report dials a month, so its export opens on that month rather than on
 * today's month-to-date, and the file can never disagree with the screen.
 * `{}` for a key that is not a month.
 */
export function monthRange(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return {};
  const year = Number(match[1]);
  const month = Number(match[2]);
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${match[1]}-${match[2]}-01`,
    to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * The windows a sheet offers as one-tap chips, keyed by name.
 *
 * They are computed from `defaultRange` and `monthRange`, so a preset and a
 * hand-typed window are the same kind of value and comparing them tells the
 * sheet which chip to light up.
 */
export function quickRanges(today = new Date()) {
  const day = isoDay(today);
  const month = day.slice(0, 7);
  return {
    thisMonth: defaultRange(today),
    lastMonth: monthRange(shiftMonth(month, -1)),
    last3Months: { from: monthRange(shiftMonth(month, -2)).from, to: day },
    thisYear: { from: `${day.slice(0, 4)}-01-01`, to: `${day.slice(0, 4)}-12-31` },
  };
}

/** The preset a window matches exactly, or "" when it is a custom window. */
export function matchingRangeName(range = {}, today = new Date()) {
  const entries = Object.entries(quickRanges(today));
  const hit = entries.find(
    ([, preset]) => preset.from === isoDay(range.from) && preset.to === isoDay(range.to)
  );
  return hit ? hit[0] : "";
}

/* ------------------------------------------------------------------ */
/* Role scoping                                                         */
/* ------------------------------------------------------------------ */

/**
 * Narrow shift rows to what the viewer is entitled to export.
 *
 * Row-level security already refuses to hand an attendant a co-worker's shift,
 * so in practice this filter has nothing to remove — it is defence in depth
 * for the case where a screen is given a wider list than the exporter should
 * write out (an owner's dashboard reusing an attendant's component, say).
 * It is never the only thing standing between an attendant and someone else's
 * figures; `scripts/rbac/run.mjs` proves the database refuses the request
 * itself.
 */
export function scopeShiftsToViewer(shifts = [], profile) {
  if (!profile) return [];
  if (profile.role !== "attendant") return [...shifts];
  return shifts.filter(
    (shift) => shift.userId === profile.uid || shift.employeeId === profile.uid
  );
}

/* ------------------------------------------------------------------ */
/* Report builders                                                      */
/* ------------------------------------------------------------------ */

const STATUS_TEXT = {
  [SHIFT_STATUS.OPEN]: "Open",
  [SHIFT_STATUS.PENDING_REVIEW]: "Pending review",
  [SHIFT_STATUS.APPROVED]: "Approved",
  [SHIFT_STATUS.REJECTED]: "Sent back",
};

export function statusText(status) {
  return STATUS_TEXT[status] || String(status || "—");
}

/** A day's review position, rolled up from the shifts that make it. */
export function dayReviewStatus(shifts = []) {
  if (shifts.length === 0) return "—";
  const statuses = shifts.map((entry) => entry.shift?.status ?? entry.status);
  if (statuses.some((s) => s === SHIFT_STATUS.REJECTED)) return "Sent back";
  if (statuses.every((s) => s === SHIFT_STATUS.APPROVED)) return "Approved";
  if (statuses.some((s) => s === SHIFT_STATUS.PENDING_REVIEW)) return "Pending review";
  return statusText(statuses[0]);
}

/**
 * Daily ledger: one row per trading day.
 * date · station · total sales · total expenses · cash variance · shifts · status
 */
export function ledgerReport({ days = [], stationName = "", fuelGroup = "ALL" } = {}) {
  const scopedDays = days.map((day) => {
    if (fuelGroup === "ALL") return day;
    const fuels = Object.entries(day.fuels || {}).filter(
      ([fuel]) => classifyFuel(fuel) === fuelGroup
    );
    const litres = fuels.reduce((sum, [, value]) => sum + num(value.litres), 0);
    const sales = fuels.reduce(
      (sum, [, value]) => sum + num(value.revenue ?? value.amount),
      0
    );
    return { ...day, litres, sales, fuels: Object.fromEntries(fuels) };
  });
  return {
    columns: [
      "Date",
      "Station",
      "Litres sold",
      "Total sales",
      "Credit sales",
      "Total expenses",
      "Cash collected",
      "Cash variance",
      "Shift count",
      "Review status",
    ],
    rows: scopedDays.map((day) => [
      day.date,
      stationName,
      decimal(day.litres),
      decimal(day.sales),
      decimal(day.credit),
      decimal(day.expenses),
      decimal(day.declared),
      decimal(day.variance),
      String(day.shifts?.length ?? 0),
      dayReviewStatus(day.shifts),
    ]),
  };
}

/** "N1 (Petrol), N2 (Diesel)" — the nozzles an operator actually worked. */
function nozzleList(lines = []) {
  return lines.map((line) => `${line.label} (${line.fuelType || "—"})`).join(", ");
}

/** "N1 1000.00→1180.50" per nozzle, so a reading can be checked by hand. */
function readingList(lines = [], pick) {
  return lines.map((line) => `${line.label} ${decimal(pick(line))}`).join(", ");
}

/** "Petrol 180.50 L / ₹ 19042.75" per fuel type. */
function fuelBreakdown(fuels = {}) {
  return Object.entries(fuels)
    .map(
      ([fuel, value]) => `${fuel} ${decimal(value.litres)} L = ${decimal(value.revenue)}`
    )
    .join("; ");
}

function reportScopedShifts({
  shifts = [],
  range = {},
  fuelGroup = "ALL",
  employeeId = "",
  status = "ALL",
} = {}) {
  return filterByRange(shifts, range, (shift) => shift?.date || shift?.startTime)
    .filter(
      (shift) =>
        !employeeId || shift.employeeId === employeeId || shift.userId === employeeId
    )
    .filter((shift) => status === "ALL" || shift.status === status)
    .map((shift) => {
      if (fuelGroup === "ALL") return shift;
      return {
        ...shift,
        nozzles: (shift.nozzles || []).filter(
          (line) => classifyFuel(line.fuelType) === fuelGroup
        ),
      };
    })
    .filter((shift) => fuelGroup === "ALL" || (shift.nozzles || []).length > 0);
}

/**
 * Shifts: one row per handed-in shift.
 * date · employee · nozzles · readings · sales by fuel · expenses · variance · status
 *
 * `range` is filtered here as well as by the caller: a screen that hands over
 * its whole month and then narrows the window in the export sheet still gets
 * a file that matches the rows it is showing.
 */
export function shiftsReport({
  shifts = [],
  range = {},
  stationName = "",
  fuelGroup = "ALL",
  employeeId = "",
  status = "ALL",
} = {}) {
  const selected = reportScopedShifts({ shifts, range, fuelGroup, employeeId, status });
  return {
    columns: [
      "Date",
      "Station",
      "Employee",
      "Nozzles worked",
      "Opening readings",
      "Closing readings",
      "Litres sold",
      "Sales by fuel type",
      "Gross sales",
      "Testing",
      "Expenses",
      "Net due",
      "Collected",
      "Cash handover",
      "Variance",
      "Status",
    ],
    rows: selected.map((shift) => {
      const totals = shiftTotals(shift);
      return [
        shift.date || isoDay(shift.startTime),
        stationName,
        shift.employeeName || "—",
        nozzleList(totals.lines),
        readingList(totals.lines, (line) => line.openingReading),
        readingList(totals.lines, (line) => line.closingReading),
        decimal(totals.totalLitres),
        fuelBreakdown(totals.fuels),
        decimal(totals.gross),
        decimal(totals.testingTotal),
        decimal(totals.expensesTotal),
        decimal(totals.net),
        decimal(totals.declared),
        decimal(totals.handover),
        decimal(totals.variance),
        statusText(shift.status),
      ];
    }),
  };
}

const SHIFT_STATEMENT_COLUMNS = [
  "Date",
  "Employee",
  "Opened (HH:MM)",
  "Closed (HH:MM)",
  "MS litres",
  "MS rate",
  "MS amount",
  "HSD litres",
  "HSD rate",
  "HSD amount",
  "Other litres",
  "Other amount",
  "Total litres",
  "Total sale",
  "Testing",
  "Expenses",
  "Cash",
  "UPI",
  "Card",
  "Credit",
  "Net due",
  "Cash received",
  "Variance",
  "Status",
];

const STATEMENT_INDEX = {
  date: 0,
  employee: 1,
  msLitres: 4,
  msRate: 5,
  msAmount: 6,
  hsdLitres: 7,
  hsdRate: 8,
  hsdAmount: 9,
  otherLitres: 10,
  otherAmount: 11,
  totalLitres: 12,
  totalSale: 13,
  testing: 14,
  expenses: 15,
  cash: 16,
  upi: 17,
  card: 18,
  credit: 19,
  netDue: 20,
  cashReceived: 21,
  variance: 22,
};

const STATEMENT_ADDITIVE_INDEXES = [
  STATEMENT_INDEX.msLitres,
  STATEMENT_INDEX.msAmount,
  STATEMENT_INDEX.hsdLitres,
  STATEMENT_INDEX.hsdAmount,
  STATEMENT_INDEX.otherLitres,
  STATEMENT_INDEX.otherAmount,
  STATEMENT_INDEX.totalLitres,
  STATEMENT_INDEX.totalSale,
  STATEMENT_INDEX.testing,
  STATEMENT_INDEX.expenses,
  STATEMENT_INDEX.cash,
  STATEMENT_INDEX.upi,
  STATEMENT_INDEX.card,
  STATEMENT_INDEX.credit,
  STATEMENT_INDEX.netDue,
  STATEMENT_INDEX.cashReceived,
  STATEMENT_INDEX.variance,
];

function clockTime(value) {
  if (!value) return "";
  const text = String(value);
  const plain = text.match(/^(\d{2}):(\d{2})/);
  if (plain) return `${plain[1]}:${plain[2]}`;
  const iso = text.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
        2,
        "0"
      )}`;
}

function statementFuelBucket(lines = [], groups = []) {
  return lines.reduce(
    (out, line) => {
      if (groups.includes(classifyFuel(line.fuelType))) {
        out.litres += num(line.litresSold);
        out.revenue += num(line.revenue);
      }
      return out;
    },
    { litres: 0, revenue: 0 }
  );
}

function statementShowsGroup(fuelGroup, group) {
  if (fuelGroup === "ALL") return true;
  if (group === "OTHER") return fuelGroup === "CNG" || fuelGroup === "OTHER";
  return fuelGroup === group;
}

function statementRate(litres, revenue) {
  return num(litres) > 0 ? decimal(num(revenue) / num(litres)) : "";
}

function statementFuelCells(bucket, group, fuelGroup) {
  if (!statementShowsGroup(fuelGroup, group)) {
    return group === "OTHER" ? ["", ""] : ["", "", ""];
  }
  if (group === "OTHER") return [decimal(bucket.litres), decimal(bucket.revenue)];
  return [
    decimal(bucket.litres),
    statementRate(bucket.litres, bucket.revenue),
    decimal(bucket.revenue),
  ];
}

function shiftStatementDataRow(shift, fuelGroup) {
  const totals = shiftTotals(shift);
  const ms = statementFuelBucket(totals.lines, ["MS"]);
  const hsd = statementFuelBucket(totals.lines, ["HSD"]);
  const other = statementFuelBucket(totals.lines, ["CNG", "OTHER"]);

  return [
    shift.date || isoDay(shift.startTime),
    shift.employeeName || "—",
    clockTime(shift.startTime),
    clockTime(shift.endTime),
    ...statementFuelCells(ms, "MS", fuelGroup),
    ...statementFuelCells(hsd, "HSD", fuelGroup),
    ...statementFuelCells(other, "OTHER", fuelGroup),
    decimal(totals.totalLitres),
    decimal(totals.gross),
    decimal(totals.testingTotal),
    decimal(totals.expensesTotal),
    decimal(totals.payments.cash),
    decimal(totals.payments.upi),
    decimal(totals.payments.card),
    decimal(totals.payments.credit),
    decimal(totals.net),
    decimal(totals.handover),
    decimal(totals.variance),
    statusText(shift.status),
  ];
}

function shiftStatementTotalRow(rows, label, fuelGroup) {
  const row = Array(SHIFT_STATEMENT_COLUMNS.length).fill("");
  row[STATEMENT_INDEX.employee] = label;
  STATEMENT_ADDITIVE_INDEXES.forEach((index) => {
    row[index] = decimal(rows.reduce((sum, item) => sum + num(item[index]), 0));
  });

  if (statementShowsGroup(fuelGroup, "MS")) {
    row[STATEMENT_INDEX.msRate] = statementRate(
      row[STATEMENT_INDEX.msLitres],
      row[STATEMENT_INDEX.msAmount]
    );
  } else {
    row[STATEMENT_INDEX.msLitres] = "";
    row[STATEMENT_INDEX.msRate] = "";
    row[STATEMENT_INDEX.msAmount] = "";
  }

  if (statementShowsGroup(fuelGroup, "HSD")) {
    row[STATEMENT_INDEX.hsdRate] = statementRate(
      row[STATEMENT_INDEX.hsdLitres],
      row[STATEMENT_INDEX.hsdAmount]
    );
  } else {
    row[STATEMENT_INDEX.hsdLitres] = "";
    row[STATEMENT_INDEX.hsdRate] = "";
    row[STATEMENT_INDEX.hsdAmount] = "";
  }

  if (!statementShowsGroup(fuelGroup, "OTHER")) {
    row[STATEMENT_INDEX.otherLitres] = "";
    row[STATEMENT_INDEX.otherAmount] = "";
  }

  return row;
}

/** Bank-statement-style, chronological shift sales and settlement detail. */
export function shiftStatementReport({
  shifts = [],
  range = {},
  stationName = "",
  fuelGroup = "ALL",
  employeeId = "",
  status = "ALL",
} = {}) {
  const selected = reportScopedShifts({
    shifts,
    range,
    fuelGroup,
    employeeId,
    status,
  }).sort((a, b) => {
    const day = String(a.date || isoDay(a.startTime)).localeCompare(
      String(b.date || isoDay(b.startTime))
    );
    return day || String(a.startTime || "").localeCompare(String(b.startTime || ""));
  });
  const rawRows = selected.map((shift) => shiftStatementDataRow(shift, fuelGroup));
  const rows = [];
  let dayRows = [];

  rawRows.forEach((row, index) => {
    if (
      dayRows.length &&
      row[STATEMENT_INDEX.date] !== dayRows[0][STATEMENT_INDEX.date]
    ) {
      rows.push(shiftStatementTotalRow(dayRows, "Day total", fuelGroup));
      dayRows = [];
    }
    rows.push(row);
    dayRows.push(row);
    if (index === rawRows.length - 1) {
      rows.push(shiftStatementTotalRow(dayRows, "Day total", fuelGroup));
    }
  });
  if (rawRows.length)
    rows.push(shiftStatementTotalRow(rawRows, "GRAND TOTAL", fuelGroup));

  return { columns: SHIFT_STATEMENT_COLUMNS, rows, meta: { station: stationName } };
}

/**
 * One customer's statement for one period: the same opening balance, entries,
 * closing balance and totals the Statement screen is showing.
 *
 * It is built from `buildStatement`, which is also what the screen renders, so
 * the download can never drift from the display. Rows are written oldest
 * first, the way a bank statement is read, even though the screen lists them
 * newest first.
 */
export function statementReport({
  customer = {},
  range = {},
  filter = "all",
  stationName = "",
} = {}) {
  const statement = buildStatement({
    transactions: customer.transactions || [],
    range,
    filter,
  });
  const label = (entry) =>
    entry.note || (entry.type === "credit" ? "Credit given" : "Payment received");
  const rows = [
    [isoDay(range.from), "", "Opening balance", "", "", "", decimal(statement.opening)],
    ...statement.ascending.map((entry) => [
      entry.day,
      entry.time,
      label(entry),
      entry.recordedByName,
      entry.type === "credit" ? decimal(entry.amount) : "",
      entry.type === "payment" ? decimal(entry.amount) : "",
      decimal(entry.balance),
    ]),
    [isoDay(range.to), "", "Closing balance", "", "", "", decimal(statement.closing)],
    [
      "",
      "",
      "Totals",
      "",
      decimal(statement.totals.creditGiven),
      decimal(statement.totals.paymentsReceived),
      decimal(statement.totals.net),
    ],
  ];
  return {
    columns: [
      "Date",
      "Time",
      "Description",
      "Recorded by",
      "Debit (credit given)",
      "Credit (payment received)",
      "Balance",
    ],
    rows,
    meta: {
      station: stationName,
      customer: customer.name || "",
      phone: customer.phone || "",
    },
  };
}

/**
 * Credit customers: the account balance, then every transaction behind it.
 *
 * A customer with no movement in the window still gets a row, because their
 * outstanding balance is the point of the report.
 */
export function creditReport({ customers = [], range = {}, stationName = "" } = {}) {
  const rows = [];
  customers.forEach((customer) => {
    const transactions = filterByRange(
      customer.transactions || [],
      range,
      (tx) => tx.date || tx.recordedAt
    ).slice();
    // Oldest first, so the running balance column reads downwards.
    transactions.sort((a, b) =>
      String(a.date || a.recordedAt).localeCompare(String(b.date || b.recordedAt))
    );

    const balance = num(customer.outstandingBalance);
    if (transactions.length === 0) {
      rows.push([
        customer.name || "—",
        customer.phone || "",
        stationName,
        "",
        "",
        "",
        "",
        decimal(balance),
        decimal(balance),
      ]);
      return;
    }

    let running = 0;
    transactions.forEach((tx) => {
      running += tx.type === "credit" ? num(tx.amount) : -num(tx.amount);
      rows.push([
        customer.name || "—",
        customer.phone || "",
        stationName,
        isoDay(tx.date || tx.recordedAt),
        tx.type === "credit" ? "Credit given" : "Payment received",
        decimal(tx.amount),
        tx.note || "",
        decimal(running),
        decimal(balance),
      ]);
    });
  });

  return {
    columns: [
      "Customer",
      "Phone",
      "Station",
      "Transaction date",
      "Transaction type",
      "Amount",
      "Note",
      "Running balance",
      "Outstanding balance",
    ],
    rows,
  };
}

/**
 * Ground stock: every dip and delivery in the window, with the tank's standing
 * capacity and ullage alongside so a row makes sense on its own.
 *
 * Tanks with no movement in the window are still listed, because "nothing was
 * dipped here for three weeks" is itself worth seeing in a report.
 */
export function stockReport({
  tanks = [],
  entries = [],
  range = {},
  stationName = "",
  fuelGroup = "ALL",
} = {}) {
  const allowedTanks = tanks.filter(
    (tank) => fuelGroup === "ALL" || classifyFuel(tank.fuelType) === fuelGroup
  );
  const allowedIds = new Set(allowedTanks.map((tank) => tank.id));
  const inWindow = filterByRange(
    entries.filter((entry) => allowedIds.has(entry.tankId)),
    range,
    (entry) => entry.recordedAt
  );
  const byTank = new Map();
  inWindow.forEach((entry) => {
    const list = byTank.get(entry.tankId) || [];
    list.push(entry);
    byTank.set(entry.tankId, list);
  });

  const rows = [];
  allowedTanks.forEach((tank) => {
    const status = tankStatus(tank);
    const readings = (byTank.get(tank.id) || [])
      .slice()
      .sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));

    if (readings.length === 0) {
      rows.push([
        tank.name || "—",
        tank.fuelType || "—",
        "",
        "No movement",
        "",
        "",
        "",
        decimal(status.stock),
        decimal(status.capacity),
        decimal(status.ullage),
        "",
        "",
      ]);
      return;
    }

    readings.forEach((entry) => {
      const delivery = entry.kind === "delivery";
      rows.push([
        tank.name || "—",
        tank.fuelType || "—",
        isoDay(entry.recordedAt),
        delivery ? "Delivery" : "Dip",
        delivery ? "" : decimal(entry.stockLitres),
        delivery ? decimal(entry.change ?? entry.litres) : "",
        entry.change == null ? "" : decimal(entry.change),
        decimal(entry.stockLitres),
        decimal(status.capacity),
        decimal(Math.max(0, num(status.capacity) - num(entry.stockLitres))),
        entry.temperatureC == null ? "" : decimal(entry.temperatureC),
        entry.recordedByName || "",
      ]);
    });
  });

  return {
    columns: [
      "Tank",
      "Fuel type",
      "Date",
      "Entry",
      "Dip reading (L)",
      "Delivered (L)",
      "Stock movement (L)",
      "Stock after (L)",
      "Capacity (L)",
      "Ullage (L)",
      "Temperature (C)",
      "Recorded by",
    ],
    rows: rows.map((row) => row.map((cell) => (cell == null ? "" : cell))),
    meta: { station: stationName },
  };
}

/**
 * Monthly summary: one row per calendar month in the window, with a TOTAL
 * row whenever the window covers more than one month.
 *
 * The range decides the rows — not a month picked elsewhere on the screen —
 * so the summary can be taken for a single month, a whole quarter, or the
 * year to date without the operator editing anything by hand. The figures
 * come from the same `shiftTotals` the ledger and the shift statement use,
 * so the three can never disagree about what a month earned.
 *
 * `month` is kept as a fallback for callers that hold a month but no range;
 * an explicit `range` always wins.
 */
export function monthlyReport({
  shifts = [],
  range = {},
  month = "",
  stationName = "",
  fuelGroup = "ALL",
  employeeId = "",
  status = "ALL",
} = {}) {
  const window = range?.from || range?.to ? range : month ? monthRange(month) : {};
  const selected = reportScopedShifts({
    shifts,
    range: window,
    fuelGroup,
    employeeId,
    status,
  });

  const months = new Map();
  selected.forEach((shift) => {
    const key = monthOf(shift.date || isoDay(shift.startTime));
    if (!key) return;
    const totals = shiftTotals(shift);
    const bucket = months.get(key) || {
      key,
      dates: new Set(),
      shifts: 0,
      litres: 0,
      sales: 0,
      credit: 0,
      expenses: 0,
      variance: 0,
    };
    bucket.dates.add(shift.date || isoDay(shift.startTime));
    bucket.shifts += 1;
    bucket.litres = round2(bucket.litres + totals.totalLitres);
    bucket.sales = round2(bucket.sales + totals.gross);
    bucket.credit = round2(bucket.credit + num(totals.payments?.credit));
    bucket.expenses = round2(bucket.expenses + totals.expensesTotal);
    bucket.variance = round2(bucket.variance + (totals.variance ?? 0));
    months.set(key, bucket);
  });

  const ordered = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const rows = ordered.map((bucket) => monthRow(bucket, stationName));

  // A window covering several months closes with one row that adds them up.
  // It is folded into the same bucket shape and written by the same function,
  // so the totals can never be formatted differently from the rows above.
  if (ordered.length > 1) {
    const total = ordered.reduce(
      (out, bucket) => {
        bucket.dates.forEach((date) => out.dates.add(date));
        out.shifts += bucket.shifts;
        out.litres = round2(out.litres + bucket.litres);
        out.sales = round2(out.sales + bucket.sales);
        out.credit = round2(out.credit + bucket.credit);
        out.expenses = round2(out.expenses + bucket.expenses);
        out.variance = round2(out.variance + bucket.variance);
        return out;
      },
      {
        key: "TOTAL",
        dates: new Set(),
        shifts: 0,
        litres: 0,
        sales: 0,
        credit: 0,
        expenses: 0,
        variance: 0,
      }
    );
    rows.push(monthRow(total, stationName));
  }

  return {
    columns: MONTHLY_COLUMNS,
    rows,
    meta: { station: stationName },
  };
}

/** Cash left after the month's expenses: sales less what was spent. */
function monthNet(bucket) {
  return num(bucket.sales) - num(bucket.expenses);
}

/** One month of the summary, in column order. */
function monthRow(bucket, stationName) {
  return [
    bucket.key,
    stationName,
    String(bucket.shifts),
    String(bucket.dates.size),
    decimal(bucket.litres),
    decimal(bucket.sales),
    decimal(bucket.credit),
    decimal(bucket.expenses),
    decimal(monthNet(bucket)),
    decimal(bucket.variance),
  ];
}

const MONTHLY_COLUMNS = [
  "Month",
  "Station",
  "Shift count",
  "Days worked",
  "Litres sold",
  "Gross sales",
  "Credit sales",
  "Expenses",
  "Net cash",
  "Cash variance",
];

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

/**
 * The PDF writer.
 *
 * A report is a table, so the document is drawn as one: a title block, a
 * banded header row repeated on every page, a body in a fixed-pitch font so
 * the figures line up column for column, and a footer that says which page
 * of how many the operator is holding. Everything is measured in points
 * before anything is written, so a full page can never push its own footer
 * off the paper — the fault that made the old export look broken.
 *
 * Written by hand rather than through a PDF library: one font pair, one text
 * object per line and a handful of filled rectangles is the whole document,
 * and it keeps the bundle small.
 */

/** A4 landscape in PDF points, which is what a forecourt table needs. */
export const PAGE = { width: 842, height: 595, margin: 32 };
const FONT_SIZE = 7;
const LEADING = 10.5;
const MIN_FONT_SIZE = 4.5;
/** Courier is fixed-pitch at 0.6 em, which is what makes the columns line up. */
const CHAR_WIDTH = FONT_SIZE * 0.6;
export const MAX_CHARS = Math.floor((PAGE.width - PAGE.margin * 2) / CHAR_WIDTH);

/** Title block and footer geometry, in points, above the table. */
const TITLE_SIZE = 13;
const SUBTITLE_SIZE = 8.5;
const META_SIZE = 7.5;
const SUBTITLE_LINE = 13;
const META_LINE = 11.5;
const TITLE_GAP = 9;
/** Breathing space kept clear above the footer line. */
const FOOTER_LINE = 18;

/**
 * Where every band of a page sits, measured from the top of the sheet down.
 * `buildPdf` draws against these numbers and `rowsPerPage` counts rows from
 * them, so pagination and drawing can never drift apart.
 */
function pdfLayout(leading = LEADING) {
  const top = PAGE.height - PAGE.margin;
  const title = top - 14;
  const subtitle = title - SUBTITLE_LINE;
  const meta = subtitle - META_LINE;
  const headerTop = meta - TITLE_GAP;
  const headerBottom = headerTop - leading;
  const bodyTop = headerBottom;
  const footer = PAGE.margin + 3;
  const bodyBottom = footer + FOOTER_LINE;
  return {
    leading,
    top,
    title,
    subtitle,
    meta,
    headerTop,
    headerBottom,
    headerBaseline: headerBottom + leading * 0.28,
    bodyTop,
    bodyBottom,
    footer,
    firstRowBaseline: bodyTop - leading + 2.5,
    rows: Math.max(1, Math.floor((bodyTop - bodyBottom) / leading)),
  };
}

const printableWidth = PAGE.width - PAGE.margin * 2;

/**
 * PDF standard fonts cannot draw Devanagari, Telugu, or a rupee sign, and a
 * byte they cannot map renders as a blank or a wrong glyph. Reduce to the
 * printable Latin-1 range — which is exactly what the /WinAnsiEncoding the
 * document declares can draw — and spell the currency out instead.
 *
 * Smart punctuation is folded to its ASCII twin so a pasted note keeps
 * reading, and a station name in Telugu or Hindi becomes "???" rather than a
 * row of broken glyphs: an unreadable line is better than a misleading one.
 */
export function pdfSafe(text) {
  return String(text ?? "")
    .replace(/₹/g, "Rs.")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

/**
 * The document as bytes.
 *
 * A PDF's own string literals are WinAnsi single bytes, but a Blob built from
 * a JavaScript string would encode them as UTF-8 and turn "·" into two bytes
 * the page cannot draw. Building the file as bytes keeps every character in
 * `pdfSafe`'s range exactly one byte wide, which is also why the cross-
 * reference offsets — counted in characters — are still correct.
 */
export function pdfBytes(document = "") {
  const bytes = new Uint8Array(document.length);
  for (let index = 0; index < document.length; index += 1) {
    bytes[index] = document.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/** Escape the three characters a PDF string literal reserves. */
function pdfEscape(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfColumnWidths(safeColumns = [], safeRows = []) {
  return safeColumns.map((column, index) =>
    Math.min(
      36,
      Math.max(
        column.length,
        ...safeRows.map((row) => String(row[index] ?? "").length),
        3
      )
    )
  );
}

function pdfLineLength(widths = []) {
  if (!widths.length) return 0;
  return widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 2;
}

function pdfLayoutProfile({ columns = [], rows = [] } = {}) {
  const safeColumns = columns.map(pdfSafe);
  const safeRows = rows.map((row) => row.map(pdfSafe));
  const neededChars = pdfLineLength(pdfColumnWidths(safeColumns, safeRows));
  if (neededChars <= MAX_CHARS) {
    return { fontSize: FONT_SIZE, leading: LEADING, maxChars: MAX_CHARS };
  }
  const fontSize = Math.max(
    MIN_FONT_SIZE,
    Math.min(FONT_SIZE, printableWidth / (Math.max(neededChars, 1) * 0.6))
  );
  return {
    fontSize,
    leading: fontSize * 1.5,
    maxChars: Math.floor(printableWidth / (fontSize * 0.6)),
  };
}

/** A cell that reads as a figure: a number, a percentage, or an empty cell. */
const NUMERIC_CELL = /^-?[\d,]+(\.\d+)?%?$/;

function looksNumeric(value) {
  const text = String(value ?? "").trim();
  return text !== "" && NUMERIC_CELL.test(text);
}

/**
 * Which columns are figures and so read right-aligned under their heading.
 *
 * A column counts as numeric when every non-empty cell in it is one. The
 * test runs on the ORIGINAL values, not the padded text, so "2026-09-18" and
 * "09:30" stay left-aligned where they belong.
 */
export function pdfColumnAligns(columns = [], rows = []) {
  return columns.map((_, index) => {
    const cells = rows
      .map((row) => (Array.isArray(row) ? row[index] : undefined))
      .filter((value) => String(value ?? "").trim() !== "");
    if (cells.length === 0) return "left";
    return cells.every(looksNumeric) ? "right" : "left";
  });
}

/**
 * Lay a report out as fixed-width text rows.
 *
 * Each column is sized to its widest cell, then the whole line is clipped to
 * the page width so a long note can never spill off the paper.
 */
export function pdfTextRows(
  { columns = [], rows = [] } = {},
  { maxChars = MAX_CHARS, aligns } = {}
) {
  const safeColumns = columns.map(pdfSafe);
  const safeRows = rows.map((row) => row.map(pdfSafe));
  const widths = pdfColumnWidths(safeColumns, safeRows);
  const alignment = aligns || pdfColumnAligns(columns, rows);
  const cell = (value, index) => {
    const text = String(value ?? "").slice(0, widths[index]);
    return alignment[index] === "right"
      ? text.padStart(widths[index])
      : text.padEnd(widths[index]);
  };
  const line = (cells) => cells.map(cell).join("  ").slice(0, maxChars).trimEnd();
  const header = line(safeColumns);

  return {
    header,
    rule: "-".repeat(Math.min(maxChars, header.length)),
    body: safeRows.map(line),
  };
}

/** How many body rows fit under the title block on one page. */
export function rowsPerPage(leading = LEADING) {
  return pdfLayout(leading).rows;
}

/** Split body lines into pages. An empty report still produces one page. */
export function paginate(lines = [], perPage = rowsPerPage()) {
  if (lines.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages;
}

/**
 * A row that closes a group — "Day total", "GRAND TOTAL", "TOTAL" — and is
 * drawn in bold with a rule above it, the way a statement ends a section.
 */
export function pdfRowEmphasis(row = []) {
  return /^\s*(day\s+)?(grand\s+)?total\s*$/i.test(String(row[0] ?? "")) ||
    /^\s*(day\s+)?(grand\s+)?total\s*$/i.test(String(row[1] ?? ""))
    ? "total"
    : "";
}

/** Width of a Courier run in points, which is what right-aligning needs. */
function pdfTextWidth(text, size = FONT_SIZE, bold = false) {
  // Courier is fixed-pitch at 0.6 em; bold is a hair wider.
  const factor = bold ? 0.61 : 0.6;
  return String(text).length * size * factor;
}

/** One text object, positioned by its baseline. */
function pdfText(x, y, text, { size = FONT_SIZE, bold = false } = {}) {
  if (!text) return "";
  return [
    "BT",
    `/${bold ? "F2" : "F1"} ${size.toFixed(2)} Tf`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `(${pdfEscape(text)}) Tj`,
    "ET",
  ].join("\n");
}

/** A filled rectangle: header bands, zebra rows, hairlines. */
function pdfRect(x, y, width, height, grey) {
  return `${grey} g\n${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(
    2
  )} re f\n0 g`;
}

/**
 * One page: the title block, the column headings, the rows handed to it and
 * the footer. `page` and `pages` are one-based.
 */
function pdfPage({
  page,
  pages,
  title,
  subtitle,
  meta,
  header = "",
  rows = [],
  emphasis = [],
  leading,
  fontSize,
}) {
  const layout = pdfLayout(leading);
  const ops = [];

  // ---- title block ----
  ops.push(
    pdfText(PAGE.margin, layout.title, pdfSafe(title), { size: TITLE_SIZE, bold: true })
  );
  if (subtitle) {
    ops.push(
      pdfText(PAGE.margin, layout.subtitle, pdfSafe(subtitle), { size: SUBTITLE_SIZE })
    );
  }
  if (meta) {
    ops.push(pdfText(PAGE.margin, layout.meta, pdfSafe(meta), { size: META_SIZE }));
  }
  const stamp = `Page ${page} of ${pages}`;
  ops.push(
    pdfText(
      PAGE.width - PAGE.margin - pdfTextWidth(stamp, META_SIZE),
      layout.meta,
      stamp,
      { size: META_SIZE }
    )
  );

  // ---- column headings, banded so the eye finds them at a glance ----
  ops.push(
    pdfRect(
      PAGE.margin,
      layout.headerBottom,
      printableWidth,
      layout.headerTop - layout.headerBottom,
      0.93
    )
  );
  ops.push(
    pdfText(PAGE.margin, layout.headerBaseline, header, {
      size: fontSize,
      bold: true,
    })
  );
  ops.push(pdfRect(PAGE.margin, layout.headerBottom - 1, printableWidth, 0.8, 0.45));

  // ---- body ----
  rows.forEach((row, index) => {
    const baseline = layout.firstRowBaseline - index * leading;
    const total = emphasis[index];
    if (total) {
      ops.push(pdfRect(PAGE.margin, baseline + 4.2, printableWidth, 0.6, 0.45));
    } else if (index % 2 === 1) {
      ops.push(pdfRect(PAGE.margin, baseline - 2.4, printableWidth, leading, 0.972));
    }
    ops.push(
      pdfText(PAGE.margin, baseline, row, {
        size: fontSize,
        bold: Boolean(total),
      })
    );
  });

  // ---- footer ----
  ops.push(pdfRect(PAGE.margin, layout.bodyBottom - 3, printableWidth, 0.5, 0.8));
  const left = pdfSafe([title, subtitle].filter(Boolean).join("  |  "));
  ops.push(pdfText(PAGE.margin, layout.footer, left.slice(0, 90), { size: META_SIZE }));
  ops.push(
    pdfText(
      PAGE.width - PAGE.margin - pdfTextWidth(stamp, META_SIZE),
      layout.footer,
      stamp,
      { size: META_SIZE }
    )
  );

  return ops.filter(Boolean).join("\n");
}

/**
 * A complete, minimal PDF 1.4 document.
 *
 * The header row repeats on every page, the figures are right-aligned under
 * their headings, total rows are bold with a rule above them, and the footer
 * says which page of how many this is — so a statement printed on the
 * forecourt counter reads on its own, without the phone next to it.
 */
export function buildPdf({
  title = "",
  subtitle = "",
  meta = "",
  columns = [],
  rows = [],
} = {}) {
  const profile = pdfLayoutProfile({ columns, rows });
  const aligns = pdfColumnAligns(columns, rows);
  const laid = pdfTextRows({ columns, rows }, { maxChars: profile.maxChars, aligns });
  const emphasis = rows.map(pdfRowEmphasis);
  const bodyPages = paginate(laid.body, rowsPerPage(profile.leading));
  const totalPages = bodyPages.length;

  const objects = [];
  const pageObjectIds = [];
  // 1 = catalog, 2 = pages, 3 = regular font, 4 = bold font, then page/content pairs.
  const firstPageId = 5;
  bodyPages.forEach((_, index) => pageObjectIds.push(firstPageId + index * 2));

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Count ${totalPages} /Kids [` +
    `${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>";

  bodyPages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const offset = index * pageLines.length;
    const stream = pdfPage({
      page: index + 1,
      pages: totalPages,
      title: index === 0 ? title : `${title} (continued)`,
      subtitle: index === 0 ? subtitle : "",
      meta: index === 0 ? meta : "",
      header: laid.header,
      rows: pageLines,
      emphasis: emphasis.slice(offset, offset + pageLines.length),
      leading: profile.leading,
      fontSize: profile.fontSize,
    });

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  const count = objects.length;
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

/* ------------------------------------------------------------------ */
/* Download                                                             */
/* ------------------------------------------------------------------ */

/**
 * How a download ended. The sheet shows a line of confirmation either way:
 * silence is what makes an export feel broken when a browser quietly refuses
 * to hand over the file.
 *
 *   "saved"       — the browser took the file and will put it in Downloads
 *   "opened"      — the anchor had no `download` support, so the file was
 *                   opened in a tab instead (older iOS Safari and some
 *                   in-app browsers) and the operator can save it from there
 *   "unsupported" — no document/object-URL API at all (server rendering, a
 *                   test environment): nothing was written
 */
export const DOWNLOAD_MODE = {
  SAVED: "saved",
  OPENED: "opened",
  UNSUPPORTED: "unsupported",
};

/** True when this environment can hand a generated file to the browser. */
export function canDownload() {
  return (
    typeof document !== "undefined" &&
    typeof document.createElement === "function" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

/**
 * Hand a generated file to the browser. No network call, nothing stored.
 *
 * The object URL is deliberately NOT revoked in the same tick: Safari starts
 * the download asynchronously and cancels it if the blob it points at has
 * already gone, which is exactly how "the button did nothing" is reported.
 * A minute is enough for any browser to have taken the file.
 */
export function downloadFile(filename, mimeType, contents) {
  if (!canDownload()) return { ok: false, mode: DOWNLOAD_MODE.UNSUPPORTED };
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body?.appendChild(link);

  // Without `download` support the attribute is ignored and a click navigates;
  // opening the blob in a tab shows the file and lets the operator save it.
  const supportsDownload = "download" in link;
  let mode = DOWNLOAD_MODE.SAVED;
  if (supportsDownload) {
    link.click();
  } else {
    mode = DOWNLOAD_MODE.OPENED;
    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(url, "_blank", "noopener");
    }
  }
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true, mode };
}

export function downloadCsv(report, filename) {
  return downloadFile(filename, "text/csv;charset=utf-8;", `\ufeff${toCsv(report)}`);
}

export function downloadPdf(report, filename) {
  return downloadFile(filename, "application/pdf", pdfBytes(buildPdf(report)));
}

/**
 * The line under a PDF's title, e.g. "Ameena Stores | City Ctr | 2026-09-01 to
 * 2026-09-19". `subject` names the thing the report is about when that is
 * narrower than the station — one credit customer's statement, say.
 */
export function reportSubtitle({ subject, stationName, from, to } = {}) {
  return [subject, stationName, `${isoOrToday(from)} to ${isoOrToday(to)}`]
    .filter(Boolean)
    .join(" | ");
}

/**
 * The scope line under a PDF's title: only the filters that actually narrow
 * the rows are named, so a full-station export does not read as if it had
 * been cut down, and the stamp says when the file was produced — the first
 * question an accountant asks about a printed statement.
 *
 * English on purpose, like the column headings: a PDF is drawn with the
 * standard fonts, which cannot render Telugu or Devanagari at all.
 */
/**
 * When a report was produced, written out in full: "15 Oct 2026, 06:34".
 * `formatStamp` is the app's short on-screen form (day, month, time) and has
 * no year, which is the first thing a filed statement needs.
 */
export function generatedStamp(when = new Date()) {
  const date = when?.toDate ? when.toDate() : new Date(when);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function reportScopeLine({
  fuelGroup = "ALL",
  showFuel = true,
  employeeName = "",
  showEmployee = false,
  status = "ALL",
  showStatus = false,
  generatedAt = new Date(),
} = {}) {
  const parts = [];
  if (showFuel) {
    parts.push(fuelGroup && fuelGroup !== "ALL" ? `Fuel: ${fuelGroup}` : "All fuels");
  }
  if (showEmployee && employeeName) parts.push(`Employee: ${employeeName}`);
  if (showStatus && status !== "ALL") parts.push(`Status: ${statusText(status)}`);
  parts.push(`Generated ${generatedStamp(generatedAt)}`);
  // ASCII separators: this line is drawn with the PDF standard fonts.
  return parts.join("  |  ");
}

/** Human date helpers re-exported so report screens keep one import. */
export { formatDate, formatStamp };
