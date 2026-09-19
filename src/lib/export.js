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
import { SHIFT_STATUS, shiftTotals } from "./shiftMath.js";
import { tankStatus } from "./tankMath.js";

/** Everything this app exports is prefixed so downloads sort together. */
export const FILE_PREFIX = "pumpmithra";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

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
 * `pumpmithra-shifts-cityctr-2026-09-01_2026-09-19.csv`
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
} = {}) {
  const slug = stationSlug(stationName);
  const start = isoOrToday(from);
  const end = isoOrToday(to);
  const kind = String(report || "report").replace(/[^a-z0-9]+/gi, "-");
  return `${FILE_PREFIX}-${kind}-${slug}-${start}_${end}.${extension}`;
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
export function ledgerReport({ days = [], stationName = "" } = {}) {
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
    rows: days.map((day) => [
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

/**
 * Shifts: one row per handed-in shift.
 * date · employee · nozzles · readings · sales by fuel · expenses · variance · status
 */
export function shiftsReport({ shifts = [], stationName = "" } = {}) {
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
    rows: shifts.map((shift) => {
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
} = {}) {
  const inWindow = filterByRange(entries, range, (entry) => entry.recordedAt);
  const byTank = new Map();
  inWindow.forEach((entry) => {
    const list = byTank.get(entry.tankId) || [];
    list.push(entry);
    byTank.set(entry.tankId, list);
  });

  const rows = [];
  tanks.forEach((tank) => {
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

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

/** A4 landscape in PDF points, which is what a forecourt table needs. */
export const PAGE = { width: 842, height: 595, margin: 32 };
const FONT_SIZE = 7;
const LEADING = 10.5;
/** Courier is fixed-pitch at 0.6 em, which is what makes the columns line up. */
const CHAR_WIDTH = FONT_SIZE * 0.6;
export const MAX_CHARS = Math.floor((PAGE.width - PAGE.margin * 2) / CHAR_WIDTH);

/**
 * PDF standard fonts cannot draw Devanagari, Telugu, or a rupee sign, and a
 * byte they cannot map renders as a blank or a wrong glyph. Reduce to the
 * printable Latin-1 range and spell the currency out instead.
 */
export function pdfSafe(text) {
  return String(text ?? "")
    .replace(/₹/g, "Rs.")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** Escape the three characters a PDF string literal reserves. */
function pdfEscape(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Lay a report out as fixed-width text rows.
 *
 * Each column is sized to its widest cell, then the whole line is clipped to
 * the page width so a long note can never spill off the paper.
 */
export function pdfTextRows({ columns = [], rows = [] } = {}) {
  const safeColumns = columns.map(pdfSafe);
  const safeRows = rows.map((row) => row.map(pdfSafe));
  const widths = safeColumns.map((column, index) =>
    Math.min(
      36,
      Math.max(
        column.length,
        ...safeRows.map((row) => String(row[index] ?? "").length),
        3
      )
    )
  );
  const line = (cells) =>
    cells
      .map((cell, index) =>
        String(cell ?? "")
          .slice(0, widths[index])
          .padEnd(widths[index])
      )
      .join("  ")
      .slice(0, MAX_CHARS)
      .trimEnd();

  return {
    header: line(safeColumns),
    rule: "-".repeat(Math.min(MAX_CHARS, line(safeColumns).length)),
    body: safeRows.map(line),
  };
}

/** How many body rows fit under the title block on one page. */
export function rowsPerPage() {
  const usable = PAGE.height - PAGE.margin * 2 - LEADING * 5;
  return Math.max(1, Math.floor(usable / LEADING));
}

/** Split body lines into pages. An empty report still produces one page. */
export function paginate(lines = [], perPage = rowsPerPage()) {
  if (lines.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages;
}

/**
 * A complete, minimal PDF 1.4 document.
 *
 * Writing the file by hand rather than pulling in a PDF library keeps the
 * bundle small — a report is a monospaced table, which needs one font, one
 * text object per line, and nothing else.
 */
export function buildPdf({ title = "", subtitle = "", columns = [], rows = [] } = {}) {
  const laid = pdfTextRows({ columns, rows });
  const pages = paginate(laid.body);

  const objects = [];
  const pageObjectIds = [];
  // 1 = catalog, 2 = pages, 3 = regular font, 4 = bold font, then page/content pairs.
  const firstPageId = 5;
  pages.forEach((_, index) => pageObjectIds.push(firstPageId + index * 2));

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} /Kids [` +
    `${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const heading = [
      { text: pdfSafe(title), bold: true },
      { text: pdfSafe(subtitle), bold: false },
      { text: "", bold: false },
      { text: laid.header, bold: true },
      { text: laid.rule, bold: false },
    ];
    const footer = [
      { text: "", bold: false },
      { text: `Page ${index + 1} of ${pages.length}`, bold: false },
    ];
    const all = [
      ...heading,
      ...pageLines.map((text) => ({ text, bold: false })),
      ...footer,
    ];

    let y = PAGE.height - PAGE.margin - LEADING;
    const stream = all
      .map(({ text, bold }) => {
        const chunk = [
          "BT",
          `/${bold ? "F2" : "F1"} ${FONT_SIZE} Tf`,
          `1 0 0 1 ${PAGE.margin} ${y.toFixed(2)} Tm`,
          `(${pdfEscape(text)}) Tj`,
          "ET",
        ].join("\n");
        y -= LEADING;
        return chunk;
      })
      .join("\n");

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

/** Hand a generated file to the browser. No network call, nothing stored. */
export function downloadFile(filename, mimeType, contents) {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
    return false;
  }
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export function downloadCsv(report, filename) {
  return downloadFile(filename, "text/csv;charset=utf-8;", `\ufeff${toCsv(report)}`);
}

export function downloadPdf(report, filename) {
  return downloadFile(filename, "application/pdf", buildPdf(report));
}

/** Title line a PDF carries, e.g. "Shifts · City Ctr · 2026-09-01 to 2026-09-19". */
export function reportSubtitle({ stationName, from, to } = {}) {
  return [stationName, `${isoOrToday(from)} to ${isoOrToday(to)}`]
    .filter(Boolean)
    .join(" | ");
}

/** Human date helpers re-exported so report screens keep one import. */
export { formatDate, formatStamp };
