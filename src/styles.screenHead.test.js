/**
 * The screen header's responsive rules, pinned.
 *
 * `.screen-head`, `.screen-head__actions` and `.screen-head__actions > *`
 * used to be redeclared in three different media blocks, two of which shared
 * the same `max-width: 860px` query. Reading any one of them gave the wrong
 * answer, because a later block silently won. This test does two things:
 *
 *   1. Fails if the rules fragment across media blocks again.
 *   2. Pins what the cascade resolves to at the phone widths the project
 *      supports — in particular that the header actions (the "Create login"
 *      button on Staff & access) take the full row at 375px and 390px and
 *      keep a 40px tap target.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

const SCREEN_HEAD = /^\.screen-head(\b|__)/;

/** Blocks in source order: plain rules carry `media: null`. */
function parseBlocks(input) {
  const source = input.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf("@media", i);
    const brace = source.indexOf("{", i);
    if (brace === -1) break;
    if (at !== -1 && at < brace) {
      const open = source.indexOf("{", at);
      let depth = 0;
      let j = open;
      for (; j < source.length; j++) {
        if (source[j] === "{") depth++;
        else if (source[j] === "}" && --depth === 0) break;
      }
      blocks.push({
        media: source.slice(at + "@media".length, open).trim(),
        rules: parseRules(source.slice(open + 1, j)),
      });
      i = j + 1;
    } else {
      const end = at === -1 ? source.length : at;
      blocks.push({ media: null, rules: parseRules(source.slice(i, end)) });
      i = end;
    }
  }
  return blocks;
}

function parseRules(body) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(body))) {
    const declarations = {};
    for (const part of match[2].split(";")) {
      const colon = part.indexOf(":");
      if (colon === -1) continue;
      declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    }
    for (const selector of match[1].split(",")) {
      const cleaned = selector.replace(/\s+/g, " ").trim();
      if (cleaned) rules.push({ selector: cleaned, declarations });
    }
  }
  return rules;
}

function appliesAt(media, width) {
  if (media === null) return true;
  const max = /max-width:\s*(\d+)px/.exec(media);
  const min = /min-width:\s*(\d+)px/.exec(media);
  if (!max && !min) return false; // prefers-reduced-motion, display-mode, …
  if (max && width > Number(max[1])) return false;
  if (min && width < Number(min[1])) return false;
  return true;
}

const blocks = parseBlocks(css);

/** Everything declared for one exact selector at one viewport width. */
function resolve(selector, width) {
  const resolved = {};
  for (const block of blocks) {
    if (!appliesAt(block.media, width)) continue;
    for (const rule of block.rules) {
      if (rule.selector === selector) Object.assign(resolved, rule.declarations);
    }
  }
  return resolved;
}

function blocksDeclaringScreenHead(media) {
  return blocks.filter(
    (block) =>
      block.media === media && block.rules.some((rule) => SCREEN_HEAD.test(rule.selector))
  );
}

describe("screen header responsive rules are consolidated", () => {
  it("declares its phone rules in exactly one max-width: 860px block", () => {
    expect(blocksDeclaringScreenHead("(max-width: 860px)")).toHaveLength(1);
  });

  it("declares its narrow-phone rules in exactly one max-width: 390px block", () => {
    expect(blocksDeclaringScreenHead("(max-width: 390px)")).toHaveLength(1);
  });

  it("never declares the same selector twice inside one block", () => {
    for (const block of blocks) {
      const seen = block.rules
        .map((rule) => rule.selector)
        .filter((selector) => SCREEN_HEAD.test(selector));
      expect(new Set(seen).size).toBe(seen.length);
    }
  });
});

describe("the header actions at the supported phone widths", () => {
  for (const width of [320, 360, 375, 390]) {
    it(`takes the full row at ${width}px, so a labelled button stays visible`, () => {
      const actions = resolve(".screen-head__actions", width);
      expect(actions.width).toBe("100%");
      expect(actions["margin-left"]).toBe("0");
      expect(actions.display).toBe("flex");

      const child = resolve(".screen-head__actions > *", width);
      expect(child.flex).toBe("1 1 auto");
      expect(child["min-width"]).toBe("0");
      expect(child["max-width"]).toBe("100%");

      // A long label wraps inside the pill instead of overflowing it, and the
      // pill keeps its tap height while it does.
      expect(resolve(".screen-head__actions .tool-btn", width)["white-space"]).toBe(
        "normal"
      );
      expect(resolve(".tool-btn", width)["min-height"]).toBe("40px");
    });
  }

  it("keeps content-sized actions between 391px and 860px", () => {
    for (const width of [391, 414, 768, 860]) {
      const actions = resolve(".screen-head__actions", width);
      expect(actions.width).toBe("auto");
      expect(actions["margin-left"]).toBe("auto");
      expect(resolve(".screen-head__actions > *", width).flex).toBe("0 0 auto");
      // The row wraps, so the actions drop below a long title rather than
      // squeezing it.
      expect(resolve(".screen-head__row", width)["flex-wrap"]).toBe("wrap");
    }
  });

  it("leaves the desktop header alone", () => {
    const actions = resolve(".screen-head__actions", 1280);
    expect(actions.width).toBeUndefined();
    expect(actions["margin-left"]).toBe("auto");
    expect(resolve(".screen-head", 1280).padding).toBe("20px var(--content-gutter) 6px");
    expect(resolve(".screen-head h1", 1280)["font-size"]).toBe("22px");
  });
});
