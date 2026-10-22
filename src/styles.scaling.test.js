import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const scaling = readFileSync(new URL("./styles/scaling.css", import.meta.url), "utf8");
const perf = readFileSync(new URL("./styles/perf.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function mediaBlock(query) {
  const start = scaling.indexOf(`@media ${query}`);
  if (start === -1) throw new Error(`Missing media query: ${query}`);
  const open = scaling.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < scaling.length; i += 1) {
    if (scaling[i] === "{") depth += 1;
    if (scaling[i] === "}" && --depth === 0) return scaling.slice(open + 1, i);
  }
  throw new Error(`Unclosed media query: ${query}`);
}

describe("device scaling contract", () => {
  it("keeps zoom accessible and opts into device safe areas", () => {
    expect(index).toContain("width=device-width");
    expect(index).toContain("viewport-fit=cover");
    expect(index).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
    expect(scaling).toContain("env(safe-area-inset-left, 0px)");
    expect(scaling).toContain("env(safe-area-inset-right, 0px)");
  });

  it("uses a measured viewport with a dynamic-CSS fallback", () => {
    expect(scaling).toMatch(/\.shell\s*{[^}]*height:\s*var\(--app-height\)/);
    expect(scaling).toContain("@supports (height: 100dvh)");
  });

  it("keeps iOS and Android touch controls readable and tappable", () => {
    const coarse = mediaBlock("(pointer: coarse)");
    expect(coarse).toMatch(/input,[\s\S]*?textarea\s*{[^}]*font-size:\s*16px/);
    expect(coarse).toMatch(/min-height:\s*44px/);
  });

  it("uses two columns on tablets only where the width supports them", () => {
    const tablet = mediaBlock("(min-width: 600px) and (max-width: 860px)");
    expect(tablet).toContain(".pick-board:not(.pick-board--sheet)");
    expect(tablet).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it("turns sheets into centred, viewport-capped dialogs on larger screens", () => {
    const tabletAndDesktop = mediaBlock("(min-width: 768px)");
    expect(tabletAndDesktop).toMatch(/\.sheet-root\s*{[^}]*align-items:\s*center/);
    expect(tabletAndDesktop).toContain("var(--sheet-viewport-offset)");
    expect(tabletAndDesktop).toMatch(
      /\.sheet\s*{[^}]*border-radius:\s*var\(--radius-xl\)/
    );
  });

  it("keeps two columns when the compact desktop sidebar appears", () => {
    const compact = mediaBlock("(min-width: 861px) and (max-width: 1100px)");
    expect(compact).toContain("--sidebar-w: 208px");
    expect(compact).toContain(".pick-board:not(.pick-board--sheet)");
    expect(compact).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it("expands desktop dashboards and caps wide-screen reading width", () => {
    expect(mediaBlock("(min-width: 1024px)")).toMatch(
      /\.hero-carousel\s*{[^}]*display:\s*grid/
    );
    expect(mediaBlock("(min-width: 1440px)")).toContain("--content-max: 1280px");
  });

  it("does not let rendering hints change fixed-position alignment", () => {
    expect(perf).not.toMatch(/transform:\s*translateZ\(0\)/);
    expect(perf).not.toMatch(/\.main[^{,]*[,{][^}]*contain:\s*layout paint/);
  });
});
