import { describe, expect, it } from "vitest";
import {
  buildPdf,
  creditReport,
  csvCell,
  dayReviewStatus,
  defaultRange,
  filterByRange,
  inRange,
  isoDay,
  ledgerReport,
  MAX_CHARS,
  paginate,
  pdfSafe,
  pdfTextRows,
  reportFilename,
  reportSubtitle,
  rowsPerPage,
  scopeShiftsToViewer,
  shiftsReport,
  stationSlug,
  statusText,
  stockReport,
  toCsv,
} from "./export.js";
import { SHIFT_STATUS } from "./shiftMath.js";

/* ------------------------------------------------------------------ */
/* CSV escaping                                                        */
/* ------------------------------------------------------------------ */

describe("csvCell", () => {
  it("leaves an ordinary value untouched", () => {
    expect(csvCell("Riverside Fuel")).toBe("Riverside Fuel");
    expect(csvCell(42)).toBe("42");
  });

  it("renders null and undefined as an empty field", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("Diesel, 200L")).toBe('"Diesel, 200L"');
  });

  it("quotes and doubles an embedded quote", () => {
    expect(csvCell('He said "short"')).toBe('"He said ""short"""');
  });

  it("quotes a value containing a newline or carriage return", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("quotes leading and trailing whitespace so a spreadsheet keeps it", () => {
    expect(csvCell("  padded  ")).toBe('"  padded  "');
  });

  it("quotes a leading equals sign rather than letting it become a formula", () => {
    expect(csvCell("=1+1")).toBe('"=1+1"');
  });
});

describe("toCsv", () => {
  it("writes the header first and separates rows with CRLF", () => {
    const csv = toCsv({
      columns: ["Date", "Note"],
      rows: [
        ["2026-09-01", "plain"],
        ["2026-09-02", 'has, comma and "quote"'],
      ],
    });
    expect(csv.split("\r\n")).toEqual([
      "Date,Note",
      "2026-09-01,plain",
      '2026-09-02,"has, comma and ""quote"""',
    ]);
  });

  it("produces a header-only file when there are no rows", () => {
    expect(toCsv({ columns: ["A", "B"], rows: [] })).toBe("A,B");
  });

  it("survives being called with nothing", () => {
    expect(toCsv()).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Filenames                                                           */
/* ------------------------------------------------------------------ */

describe("stationSlug", () => {
  it("strips spaces and punctuation", () => {
    expect(stationSlug("City Ctr")).toBe("cityctr");
    expect(stationSlug("Highway-44 Fuel Point")).toBe("highway44fuelp");
  });

  it("falls back when the name has no usable characters", () => {
    expect(stationSlug("")).toBe("station");
    expect(stationSlug("!!!")).toBe("station");
  });
});

describe("reportFilename", () => {
  it("includes the app prefix, report, station, and both dates", () => {
    expect(
      reportFilename({
        report: "shifts",
        stationName: "City Ctr",
        from: "2026-09-01",
        to: "2026-09-19",
      })
    ).toBe("petrav-shifts-cityctr-2026-09-01_2026-09-19.csv");
  });

  it("honours the requested extension", () => {
    expect(
      reportFilename({
        report: "ledger",
        stationName: "Riverside Fuel",
        from: "2026-01-01",
        to: "2026-01-31",
        extension: "pdf",
      })
    ).toBe("petrav-ledger-riversidefuel-2026-01-01_2026-01-31.pdf");
  });

  it("never collides between two stations over the same window", () => {
    const range = { report: "stock", from: "2026-09-01", to: "2026-09-19" };
    expect(reportFilename({ ...range, stationName: "Alpha" })).not.toBe(
      reportFilename({ ...range, stationName: "Beta" })
    );
  });
});

/* ------------------------------------------------------------------ */
/* Date range                                                          */
/* ------------------------------------------------------------------ */

describe("isoDay", () => {
  it("reads a plain date, a timestamp, and a Date", () => {
    expect(isoDay("2026-09-19")).toBe("2026-09-19");
    expect(isoDay("2026-09-19T14:22:01.000Z")).toBe("2026-09-19");
    expect(isoDay(new Date("2026-09-19T14:22:01.000Z"))).toBe("2026-09-19");
  });

  it("returns an empty string for junk", () => {
    expect(isoDay("")).toBe("");
    expect(isoDay(null)).toBe("");
    expect(isoDay("not a date")).toBe("");
  });
});

describe("inRange", () => {
  const range = { from: "2026-09-05", to: "2026-09-10" };

  it("includes both bounds", () => {
    expect(inRange("2026-09-05", range)).toBe(true);
    expect(inRange("2026-09-10", range)).toBe(true);
  });

  it("excludes days either side", () => {
    expect(inRange("2026-09-04", range)).toBe(false);
    expect(inRange("2026-09-11", range)).toBe(false);
  });

  it("treats a missing bound as unbounded in that direction", () => {
    expect(inRange("2020-01-01", { to: "2026-09-10" })).toBe(true);
    expect(inRange("2030-01-01", { from: "2026-09-05" })).toBe(true);
  });
});

describe("filterByRange", () => {
  const rows = [
    { date: "2026-08-31" },
    { date: "2026-09-01" },
    { date: "2026-09-15" },
    { date: "2026-09-19" },
    { date: "2026-09-20" },
  ];

  it("keeps only the rows inside the window", () => {
    const kept = filterByRange(rows, { from: "2026-09-01", to: "2026-09-19" });
    expect(kept.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-15", "2026-09-19"]);
  });

  it("returns a copy of everything when no range is set", () => {
    const kept = filterByRange(rows, {});
    expect(kept).toHaveLength(rows.length);
    expect(kept).not.toBe(rows);
  });

  it("accepts a custom accessor for timestamped rows", () => {
    const dips = [
      { recordedAt: "2026-09-02T06:00:00Z" },
      { recordedAt: "2026-09-30T06:00:00Z" },
    ];
    const kept = filterByRange(
      dips,
      { from: "2026-09-01", to: "2026-09-19" },
      (d) => d.recordedAt
    );
    expect(kept).toHaveLength(1);
  });
});

describe("defaultRange", () => {
  it("opens on the current month to date", () => {
    expect(defaultRange(new Date("2026-09-19T10:00:00Z"))).toEqual({
      from: "2026-09-01",
      to: "2026-09-19",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Role scoping                                                        */
/* ------------------------------------------------------------------ */

describe("scopeShiftsToViewer", () => {
  const shifts = [
    { id: "s1", userId: "amy", employeeName: "Amy" },
    { id: "s2", userId: "ben", employeeName: "Ben" },
  ];

  it("gives an attendant only their own shifts", () => {
    const scoped = scopeShiftsToViewer(shifts, { uid: "amy", role: "attendant" });
    expect(scoped.map((s) => s.id)).toEqual(["s1"]);
  });

  it("drops a co-worker's shift even if the caller was handed it", () => {
    const scoped = scopeShiftsToViewer(shifts, { uid: "amy", role: "attendant" });
    expect(scoped.some((s) => s.employeeName === "Ben")).toBe(false);
  });

  it("leaves owner and manager exports untouched", () => {
    expect(scopeShiftsToViewer(shifts, { uid: "olive", role: "owner" })).toHaveLength(2);
    expect(scopeShiftsToViewer(shifts, { uid: "mia", role: "manager" })).toHaveLength(2);
  });

  it("exports nothing when there is no signed-in profile", () => {
    expect(scopeShiftsToViewer(shifts, null)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Report builders                                                     */
/* ------------------------------------------------------------------ */

describe("statusText and dayReviewStatus", () => {
  it("names each shift status", () => {
    expect(statusText(SHIFT_STATUS.APPROVED)).toBe("Approved");
    expect(statusText(SHIFT_STATUS.PENDING_REVIEW)).toBe("Pending review");
    expect(statusText(SHIFT_STATUS.REJECTED)).toBe("Sent back");
  });

  it("rolls a day up to its least-settled shift", () => {
    const approved = { shift: { status: SHIFT_STATUS.APPROVED } };
    const pending = { shift: { status: SHIFT_STATUS.PENDING_REVIEW } };
    const rejected = { shift: { status: SHIFT_STATUS.REJECTED } };
    expect(dayReviewStatus([approved, approved])).toBe("Approved");
    expect(dayReviewStatus([approved, pending])).toBe("Pending review");
    expect(dayReviewStatus([approved, rejected])).toBe("Sent back");
  });
});

describe("ledgerReport", () => {
  const days = [
    {
      date: "2026-09-18",
      litres: 500,
      sales: 52750,
      credit: 1200,
      expenses: 400,
      declared: 52100,
      variance: -250,
      shifts: [
        { shift: { status: SHIFT_STATUS.APPROVED } },
        { shift: { status: SHIFT_STATUS.PENDING_REVIEW } },
      ],
    },
  ];

  it("carries date, station, sales, expenses, variance, count and status", () => {
    const report = ledgerReport({ days, stationName: "City Ctr" });
    expect(report.columns).toEqual([
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
    ]);
    expect(report.rows[0]).toEqual([
      "2026-09-18",
      "City Ctr",
      "500.00",
      "52750.00",
      "1200.00",
      "400.00",
      "52100.00",
      "-250.00",
      "2",
      "Pending review",
    ]);
  });
});

describe("shiftsReport", () => {
  const shift = {
    date: "2026-09-18",
    employeeName: "Amy Attendant",
    status: SHIFT_STATUS.APPROVED,
    payments: { cash: "10000" },
    testing: { MS: "100", HSD: "0" },
    expenses: [{ label: "Tea", amount: 50 }],
    nozzles: [
      {
        nozzleId: "n1",
        label: "N1",
        fuelType: "Petrol",
        openingReading: 1000,
        closingReading: 1100,
        price: 100,
      },
    ],
  };

  it("carries every column the report is specified to include", () => {
    const report = shiftsReport({ shifts: [shift], stationName: "City Ctr" });
    expect(report.columns).toContain("Employee");
    expect(report.columns).toContain("Nozzles worked");
    expect(report.columns).toContain("Opening readings");
    expect(report.columns).toContain("Closing readings");
    expect(report.columns).toContain("Sales by fuel type");
    expect(report.columns).toContain("Expenses");
    expect(report.columns).toContain("Variance");
    expect(report.columns).toContain("Status");
  });

  it("derives the figures from the meter readings", () => {
    const [row] = shiftsReport({ shifts: [shift], stationName: "City Ctr" }).rows;
    const at = (name) =>
      row[shiftsReport({ shifts: [], stationName: "" }).columns.indexOf(name)];
    expect(at("Date")).toBe("2026-09-18");
    expect(at("Employee")).toBe("Amy Attendant");
    expect(at("Nozzles worked")).toBe("N1 (Petrol)");
    expect(at("Opening readings")).toBe("N1 1000.00");
    expect(at("Closing readings")).toBe("N1 1100.00");
    expect(at("Litres sold")).toBe("100.00");
    expect(at("Sales by fuel type")).toBe("Petrol 100.00 L = 10000.00");
    expect(at("Gross sales")).toBe("10000.00");
    expect(at("Expenses")).toBe("50.00");
    expect(at("Status")).toBe("Approved");
  });

  it("does not translate the employee's own name", () => {
    const [row] = shiftsReport({ shifts: [shift], stationName: "" }).rows;
    expect(row).toContain("Amy Attendant");
  });
});

describe("creditReport", () => {
  const customers = [
    {
      name: "Acme Transport",
      phone: "555",
      outstandingBalance: 750,
      transactions: [
        { date: "2026-09-02", type: "credit", amount: 1000, note: "Diesel 200L" },
        { date: "2026-09-12", type: "payment", amount: 250, note: "NEFT" },
        { date: "2026-10-02", type: "credit", amount: 500, note: "out of window" },
      ],
    },
    { name: "Quiet Ltd", phone: "", outstandingBalance: 0, transactions: [] },
  ];

  const range = { from: "2026-09-01", to: "2026-09-19" };

  it("writes one row per transaction in the window, with a running balance", () => {
    const report = creditReport({ customers, range, stationName: "City Ctr" });
    const acme = report.rows.filter((r) => r[0] === "Acme Transport");
    expect(acme).toHaveLength(2);
    expect(acme[0]).toEqual([
      "Acme Transport",
      "555",
      "City Ctr",
      "2026-09-02",
      "Credit given",
      "1000.00",
      "Diesel 200L",
      "1000.00",
      "750.00",
    ]);
    expect(acme[1][4]).toBe("Payment received");
    expect(acme[1][7]).toBe("750.00");
  });

  it("excludes transactions outside the date range", () => {
    const report = creditReport({ customers, range, stationName: "" });
    expect(report.rows.some((r) => r[6] === "out of window")).toBe(false);
  });

  it("still lists a customer with no movement, for their balance", () => {
    const report = creditReport({ customers, range, stationName: "" });
    const quiet = report.rows.find((r) => r[0] === "Quiet Ltd");
    expect(quiet).toBeDefined();
    expect(quiet[3]).toBe("");
  });

  it("carries name, phone, balance and transaction detail as columns", () => {
    const { columns } = creditReport({ customers: [], range });
    expect(columns).toEqual([
      "Customer",
      "Phone",
      "Station",
      "Transaction date",
      "Transaction type",
      "Amount",
      "Note",
      "Running balance",
      "Outstanding balance",
    ]);
  });
});

describe("stockReport", () => {
  const tanks = [
    { id: "t1", name: "Tank A", fuelType: "Petrol", capacity: 20000, currentStock: 8000 },
    { id: "t2", name: "Tank B", fuelType: "Diesel", capacity: 10000, currentStock: 4000 },
  ];
  const entries = [
    {
      tankId: "t1",
      kind: "dip",
      recordedAt: "2026-09-05T06:00:00Z",
      stockLitres: 7800,
      change: -200,
      temperatureC: 30,
      recordedByName: "Mia Manager",
    },
    {
      tankId: "t1",
      kind: "delivery",
      recordedAt: "2026-09-06T06:00:00Z",
      stockLitres: 12800,
      change: 5000,
      temperatureC: 32,
      recordedByName: "Mia Manager",
    },
    {
      tankId: "t1",
      kind: "dip",
      recordedAt: "2026-10-06T06:00:00Z",
      stockLitres: 9000,
      change: -3800,
    },
  ];
  const range = { from: "2026-09-01", to: "2026-09-19" };

  it("names tank, fuel, dips, deliveries, movement, capacity and ullage", () => {
    const { columns } = stockReport({ tanks: [], entries: [], range });
    expect(columns).toEqual([
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
    ]);
  });

  it("separates a dip reading from a delivered quantity", () => {
    const { rows } = stockReport({ tanks, entries, range, stationName: "City Ctr" });
    const dip = rows.find((r) => r[3] === "Dip");
    const delivery = rows.find((r) => r[3] === "Delivery");
    expect(dip[4]).toBe("7800.00");
    expect(dip[5]).toBe("");
    expect(delivery[4]).toBe("");
    expect(delivery[5]).toBe("5000.00");
    expect(delivery[6]).toBe("5000.00");
  });

  it("computes ullage against the reading, not just the current stock", () => {
    const { rows } = stockReport({ tanks, entries, range });
    const delivery = rows.find((r) => r[3] === "Delivery");
    expect(delivery[8]).toBe("20000.00");
    expect(delivery[9]).toBe("7200.00");
  });

  it("drops readings outside the window", () => {
    const { rows } = stockReport({ tanks, entries, range });
    expect(rows.some((r) => r[2] === "2026-10-06")).toBe(false);
  });

  it("still lists a tank that saw no movement", () => {
    const { rows } = stockReport({ tanks, entries, range });
    const quiet = rows.find((r) => r[0] === "Tank B");
    expect(quiet[3]).toBe("No movement");
  });
});

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

describe("pdfSafe", () => {
  it("spells the rupee sign out, because the standard fonts have no glyph", () => {
    expect(pdfSafe("₹ 1,250.00")).toBe("Rs. 1,250.00");
  });

  it("flattens smart punctuation to ASCII", () => {
    expect(pdfSafe("owner’s sign-off — today")).toBe("owner's sign-off - today");
  });

  it("replaces Telugu and Hindi text rather than emitting broken glyphs", () => {
    expect(pdfSafe("షిఫ్ట్")).toMatch(/^\?+$/);
    expect(pdfSafe("शिफ्ट")).toMatch(/^\?+$/);
  });
});

describe("pdfTextRows", () => {
  const report = {
    columns: ["Date", "Employee", "Variance"],
    rows: [
      ["2026-09-18", "Amy Attendant", "-250.00"],
      ["2026-09-19", "Ben", "0.00"],
    ],
  };

  it("pads every column to a common width so the table lines up", () => {
    const laid = pdfTextRows(report);
    const employeeStart = laid.header.indexOf("Employee");
    laid.body.forEach((line) => {
      expect(line.slice(employeeStart, employeeStart + 3).trim().length).toBeGreaterThan(
        0
      );
    });
  });

  it("emits one body line per row plus a header and a rule", () => {
    const laid = pdfTextRows(report);
    expect(laid.body).toHaveLength(2);
    expect(laid.header).toContain("Date");
    expect(laid.rule).toMatch(/^-+$/);
  });

  it("clips a line to the printable page width", () => {
    const laid = pdfTextRows({
      columns: ["A", "B", "C", "D", "E", "F", "G", "H"],
      rows: [Array.from({ length: 8 }, () => "x".repeat(60))],
    });
    expect(laid.body[0].length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("handles an empty report", () => {
    expect(pdfTextRows().body).toEqual([]);
  });
});

describe("paginate", () => {
  it("splits body lines across pages", () => {
    const perPage = rowsPerPage();
    const lines = Array.from({ length: perPage + 3 }, (_, i) => `row ${i}`);
    const pages = paginate(lines, perPage);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(perPage);
    expect(pages[1]).toHaveLength(3);
  });

  it("always produces at least one page", () => {
    expect(paginate([])).toEqual([[]]);
  });
});

describe("buildPdf", () => {
  const report = {
    title: "Shifts",
    subtitle: "City Ctr | 2026-09-01 to 2026-09-19",
    columns: ["Date", "Employee"],
    rows: [["2026-09-18", "Amy Attendant"]],
  };

  it("emits a well-formed PDF document", () => {
    const pdf = buildPdf(report);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("xref");
    expect(pdf).toContain("startxref");
  });

  it("writes the row content into the page stream", () => {
    const pdf = buildPdf(report);
    expect(pdf).toContain("Amy Attendant");
    expect(pdf).toContain("2026-09-18");
    expect(pdf).toContain("Page 1 of 1");
  });

  it("escapes the characters a PDF string literal reserves", () => {
    const pdf = buildPdf({
      ...report,
      rows: [["2026-09-18", "Paren ( and ) and \\ slash"]],
    });
    expect(pdf).toContain("Paren \\( and \\) and \\\\ slash");
  });

  it("opens a second page once the rows overflow the first", () => {
    const rows = Array.from({ length: rowsPerPage() + 5 }, (_, i) => [
      "2026-09-18",
      `Operator ${i}`,
    ]);
    const pdf = buildPdf({ ...report, rows });
    expect(pdf).toContain("Page 2 of 2");
    expect(pdf).toContain("/Count 2");
  });
});

describe("reportSubtitle", () => {
  it("names the station and the window", () => {
    expect(
      reportSubtitle({ stationName: "City Ctr", from: "2026-09-01", to: "2026-09-19" })
    ).toBe("City Ctr | 2026-09-01 to 2026-09-19");
  });
});
