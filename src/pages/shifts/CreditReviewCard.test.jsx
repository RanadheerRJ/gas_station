// @vitest-environment jsdom
/**
 * The reviewer's credit indicators. A shift whose credit was corrected or
 * voided before it was handed in must say so on the review screen, and the
 * audit detail behind the flag must be one tap away.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../state/LanguageContext.jsx";
import CreditReviewCard from "./CreditReviewCard.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

async function render(review) {
  container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <CreditReviewCard review={review} />
      </LanguageProvider>
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const REVIEW = {
  entries: 18,
  modified: 2,
  voided: 1,
  total: 42500,
  items: [
    {
      id: "a1",
      transactionId: "t1",
      action: "edited",
      customerName: "Ramesh Kumar",
      oldAmount: 5000,
      newAmount: 500,
      reason: "Wrong amount",
      actedByName: "Ravi",
      actedAt: "2026-10-05T10:43:00Z",
    },
    {
      id: "a2",
      transactionId: "t2",
      action: "voided",
      customerName: "Lakshmi Traders",
      oldAmount: 5000,
      newAmount: 0,
      reason: "Duplicate entry",
      actedByName: "Ravi",
      actedAt: "2026-10-05T10:44:00Z",
    },
  ],
};

describe("credit review indicators", () => {
  it("draws nothing when the shift had no credit", async () => {
    await render({ entries: 0, modified: 0, voided: 0, total: 0, items: [] });
    expect(container.textContent).toBe("");
  });

  it("counts the entries and flags corrections and voids", async () => {
    await render(REVIEW);
    const text = container.textContent;
    expect(text).toContain("18 entries");
    expect(text).toContain("2 modified");
    expect(text).toContain("1 voided");
  });

  it("reveals the original, the new amount, the reason, and who changed it", async () => {
    await render(REVIEW);
    const toggle = [...container.querySelectorAll("button")].at(-1);
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const text = container.textContent;
    expect(text).toContain("Ramesh Kumar");
    expect(text).toContain("5,000");
    expect(text).toContain("500");
    expect(text).toContain("Wrong amount");
    expect(text).toContain("Ravi");
    expect(text).toContain("Duplicate entry");
  });
});
