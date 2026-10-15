// @vitest-environment jsdom
/**
 * The export sheet, pinned.
 *
 * What this guards is the workflow the operator actually runs at the counter:
 * open one control, see how many rows are about to be written, narrow the
 * window, and get a confirmation that the file left the phone. The old sheet
 * stated the row count three times, showed two inputs that could not lead
 * anywhere and said nothing at all when a download was refused — so the
 * assertions here are about there being ONE truthful count, a range that
 * really moves, and a result line after each download.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../state/LanguageContext.jsx";
import ReportSheet from "./ReportSheet.jsx";
import en from "../state/locales/en.js";
import { formatDate } from "../lib/format.js";

const auth = vi.hoisted(() => ({
  profile: { uid: "u-owner", role: "owner", name: "Ravi", stationId: "st-1" },
}));

vi.mock("../state/AuthContext.jsx", () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

const api = vi.hoisted(() => ({ listStaff: vi.fn(() => Promise.resolve([])) }));
vi.mock("../lib/api", () => ({
  listStaff: api.listStaff,
  readableError: (error) => String(error?.message || error),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

/** Every file handed to the browser during a test. */
let downloads = [];
/** Every object URL the export created, so the blob's type can be checked. */
let createdUrls = [];

function stubDownloads() {
  downloads = [];
  createdUrls = [];
  if (!URL.createObjectURL) URL.createObjectURL = () => "";
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:test-${createdUrls.length}`;
    createdUrls.push({ url, blob });
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function clicked() {
    downloads.push({
      filename: this.getAttribute("download"),
      href: this.getAttribute("href"),
      mime: createdUrls.at(-1)?.blob?.type || "",
    });
  });
}

/** Twelve rows in September, one in October, none in December. */
function rowsFor(range) {
  if (range.from === "2026-09-01") return 12;
  if (range.from === "2026-10-01") return 1;
  if (range.from === "2026-12-01") return 0;
  return 3;
}

async function mount(props = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LanguageProvider initialLanguage="en" initialDictionary={en}>
        <ReportSheet
          report="shifts"
          title="Daily Sales Statement"
          fileTitle="Daily Sales Statement"
          stationName="Sri Laxmi Narasimha Filling Station"
          buildReport={(range, filters = {}) => ({
            columns: ["Date", "Employee", "Status"],
            rows: Array.from({ length: rowsFor(range) }, (_, i) => [
              `2026-09-${String(i + 1).padStart(2, "0")}`,
              filters.employeeName || "All",
              filters.status || "ALL",
            ]),
          })}
          {...props}
        />
      </LanguageProvider>
    );
  });
  return container;
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function change(element, value) {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const body = () => document.body;
const button = (name) =>
  [...body().querySelectorAll("button")].find((item) => item.textContent.trim() === name);

/** Open the sheet, the way an operator reaches it from the screen header. */
async function openSheet(props = {}) {
  await mount(props);
  await click(button("Report & export"));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("ReportSheet", () => {
  it("opens on the range the screen asked for, and counts its rows once", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-09-01", to: "2026-09-30" } });

    const [from, to] = body().querySelectorAll('input[type="date"]');
    expect(from.value).toBe("2026-09-01");
    expect(to.value).toBe("2026-09-30");
    expect(body().textContent).toContain("12 rows in range");
    // Stated once — the old sheet said it in three places and could disagree.
    expect(body().textContent.match(/rows in range/g)).toHaveLength(1);
  });

  it("says '1 row in range' rather than '1 rows in range'", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-10-01", to: "2026-10-02" } });
    expect(body().textContent).toContain("1 row in range");
  });

  it("recounts the rows when the window changes", async () => {
    stubDownloads();
    await openSheet();
    const [from, to] = body().querySelectorAll('input[type="date"]');
    await change(from, "2026-09-01");
    await change(to, "2026-09-30");
    expect(body().textContent).toContain("12 rows in range");

    await change(from, "2026-09-03");
    expect(body().textContent).toContain("3 rows in range");
  });

  it("offers one-tap windows that set both dates", async () => {
    stubDownloads();
    await openSheet();
    await click(button("Last month"));

    const [from, to] = body().querySelectorAll('input[type="date"]');
    const lastMonth = new Date();
    lastMonth.setDate(0);
    const month = lastMonth.toISOString().slice(0, 7);
    expect(from.value.startsWith(month)).toBe(true);
    expect(to.value.startsWith(month)).toBe(true);
    expect(button("Last month").getAttribute("aria-pressed")).toBe("true");
  });

  it("downloads a CSV named for the station and window, then confirms it", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-09-01", to: "2026-09-30" } });
    await click(button("Export CSV"));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe(
      "petrav-shifts-srilaxminarasi-2026-09-01_2026-09-30.csv"
    );
    expect(downloads[0].mime).toContain("text/csv");
    expect(body().textContent).toContain("CSV saved to your downloads.");
  });

  it("downloads a PDF under the report's own title, then confirms it", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-09-01", to: "2026-09-30" } });
    await click(button("Export PDF"));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toContain(".pdf");
    expect(downloads[0].mime).toBe("application/pdf");
    expect(body().textContent).toContain("PDF saved to your downloads.");
  });

  it("disables both buttons and says why when the window holds nothing", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-09-01", to: "2026-09-30" } });
    const [from] = body().querySelectorAll('input[type="date"]');
    // December holds no shifts in this fixture.
    await change(from, "2026-12-01");

    expect(body().textContent).toContain("No rows");
    expect(button("Export CSV").disabled).toBe(true);
    expect(button("Export PDF").disabled).toBe(true);
    expect(body().textContent).toContain("Nothing in this date range to export.");
    expect(downloads).toHaveLength(0);
  });

  it("pins the window and hides the range inputs on a fixed-range screen", async () => {
    stubDownloads();
    await openSheet({
      range: { from: "2026-09-18", to: "2026-09-18" },
      fixedRange: true,
    });

    expect(body().querySelectorAll('input[type="date"]')).toHaveLength(0);
    expect(body().textContent).toContain(formatDate("2026-09-18"));
    await click(button("Export CSV"));
    expect(downloads[0].filename).toContain("2026-09-18_2026-09-18");
  });

  it("clears the last confirmation when the window moves on", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-09-01", to: "2026-09-30" } });
    await click(button("Export CSV"));
    expect(body().textContent).toContain("CSV saved to your downloads.");

    const [from] = body().querySelectorAll('input[type="date"]');
    await change(from, "2026-09-05");
    expect(body().textContent).not.toContain("CSV saved to your downloads.");
  });

  it("scopes the export by fuel and reflects it in the file name", async () => {
    stubDownloads();
    await openSheet({ openingRange: { from: "2026-09-01", to: "2026-09-30" } });
    await click(button("MS"));
    await click(button("Export CSV"));

    expect(downloads[0].filename).toContain("-ms-");
  });

  it("keeps the employee picker to the roles that may read the roster", async () => {
    stubDownloads();
    await openSheet();
    expect(body().textContent).toContain("All employees");

    // An attendant's export is scoped to them; the roster is not theirs to
    // browse, so the picker goes rather than sitting there with one option.
    act(() => root.unmount());
    container.remove();
    auth.profile = { uid: "u-att", role: "attendant", name: "Ravi" };
    await openSheet({ report: "shifts" });
    expect(body().textContent).not.toContain("All employees");
    auth.profile = { uid: "u-owner", role: "owner", name: "Ravi", stationId: "st-1" };
  });
});
