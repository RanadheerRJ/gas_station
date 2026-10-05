// @vitest-environment jsdom
/**
 * The owner/manager credit activity panel: today's figures from one aggregate
 * RPC. The ledger itself lives behind each customer's statement, so this card
 * is pinned as totals only — the figures are read, not recomputed in the
 * browser, and no per-entry list is rendered underneath.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import CreditActivity from "./CreditActivity.jsx";

const api = vi.hoisted(() => ({
  creditDaySummary: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  ...api,
  readableError: (error) => String(error?.message || error),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

async function render() {
  container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <CreditActivity stationId="s1" />
      </LanguageProvider>
    );
  });
}

beforeEach(() => {
  api.creditDaySummary.mockResolvedValue({
    creditGiven: 42500,
    payments: 27500,
    netCredit: 15000,
    entries: 18,
    customers: 6,
    attendants: 4,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("credit activity", () => {
  it("shows today's figures straight from the aggregate", async () => {
    await render();
    expect(api.creditDaySummary).toHaveBeenCalledWith("s1");
    const text = container.textContent;
    // The money figures count up through an animation, so the stable
    // assertion is the counts line plus the labels the figures sit under.
    expect(text).toContain("Credit given");
    expect(text).toContain("Net credit");
    expect(text).toContain("18 credit entries");
    expect(text).toContain("6 customers");
    expect(text).toContain("4 attendants");
  });

  it("is totals only: no per-entry list and no filters", async () => {
    await render();
    expect(container.querySelector(".st-row")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).not.toContain("Recent entries");
  });
});
