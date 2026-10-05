/**
 * The customer statement's layout contract, pinned.
 *
 * The bug this guards against is the one reported from the forecourt: the
 * statement used a constrained nested viewport that clipped wrapped controls
 * and summary rows on mobile. The fix depends on explicit page-scroll and
 * sizing facts, so they are asserted here rather than left to a screenshot.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function readCssWithImports(fileUrl) {
  const content = readFileSync(fileUrl, "utf8");
  return content.replace(/@import\s+["']([^"']+)["'];/g, (_, importPath) =>
    readCssWithImports(new URL(importPath, fileUrl))
  );
}

const css = readCssWithImports(new URL("./styles.css", import.meta.url)).replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** The declaration block(s) for one selector, concatenated. */
function rulesFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[,{}])\\s*${escaped}\\s*(,[^{]*)?{([^}]*)}`, "g");
  let found = "";
  for (const match of css.matchAll(pattern)) found += match[3];
  return found;
}

describe("customer statement layout", () => {
  it("keeps the page scrollable and clears the fixed bottom tab bar", () => {
    const shell = rulesFor(".shell");
    expect(shell).toMatch(/grid-template-rows:\s*auto minmax\(0, 1fr\)/);
    const main = rulesFor(".main.main--fixed");
    expect(main).toMatch(/overflow-y:\s*auto/);
    expect(main).toMatch(/padding-bottom:\s*calc\(var\(--tabbar-h\)/);
  });

  it("keeps custom date fields inside the card on narrow phones", () => {
    expect(rulesFor(".statement__custom")).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/
    );
    expect(rulesFor(".statement__custom .field")).toMatch(/min-width:\s*0/);
    expect(rulesFor(".statement__custom input")).toMatch(/min-width:\s*0/);
  });

  it("lets the statement and complete ledger grow with the page", () => {
    const screen = rulesFor(".customer-screen");
    expect(screen).toMatch(/flex-direction:\s*column/);
    const statement = rulesFor(".statement");
    expect(statement).toMatch(/flex:\s*0 0 auto/);
    expect(statement).toMatch(/min-height:\s*0/);
    const scroll = rulesFor(".statement__scroll");
    expect(scroll).toMatch(/overflow:\s*visible/);
    expect(scroll).toMatch(/min-height:\s*0/);
  });

  it("keeps the balance card and its two actions out of the scrolling area", () => {
    expect(rulesFor(".balance-card")).toMatch(/flex:\s*0 0 auto/);
    expect(rulesFor(".balance-card__actions")).toMatch(
      /grid-template-columns:\s*1fr 1fr/
    );
    // 44px minimum touch target, with room for two lines of Telugu.
    expect(rulesFor(".balance-card__actions .cta")).toMatch(/min-height:\s*4[4-9]px/);
  });

  it("pins the column header and the date headers while the ledger scrolls", () => {
    expect(rulesFor(".statement__cols")).toMatch(/position:\s*sticky/);
    expect(rulesFor(".st-group__day")).toMatch(/position:\s*sticky/);
  });

  it("lines the digits up: monospaced, tabular, right-aligned", () => {
    const figures = rulesFor(".st-row__figures");
    expect(figures).toMatch(/font-family:\s*var\(--mono\)/);
    expect(figures).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(figures).toMatch(/text-align:\s*right/);
  });

  it("keeps the sheet's confirm button above the keyboard", () => {
    const confirm = rulesFor(".transaction-sheet__confirm");
    expect(confirm).toMatch(/position:\s*sticky/);
    expect(confirm).toMatch(/bottom:\s*0/);
  });

  it("no longer ships the old action bar styling for this screen", () => {
    expect(css).not.toMatch(/\.credit-action-buttons/);
    expect(css).not.toMatch(/\.balance-hero/);
  });
});
