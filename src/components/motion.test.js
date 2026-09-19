import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./motion.jsx", import.meta.url), "utf8");

describe("useAnimatedList render stability", () => {
  it("uses a module-level default key function", () => {
    expect(source).toMatch(/const defaultKeyOf\s*=\s*\(item\)\s*=>\s*item\.id/);
    expect(source).toMatch(/useAnimatedList\(items, keyOf = defaultKeyOf,/);
  });

  it("reads keyOf through a ref", () => {
    expect(source).toMatch(/const keyOfRef = useRef\(keyOf\)/);
    expect(source).toMatch(/keyOfRef\.current = keyOf/);
    expect(source).toMatch(/const getKey = keyOfRef\.current/);
  });

  it("does not re-arm the effect when keyOf identity changes", () => {
    expect(source).toMatch(/}, \[items, duration\]\);/);
    expect(source).not.toMatch(/}, \[items, keyOf, duration\]\);/);
  });

  it("reuses the previous rows when no rendered row changed", () => {
    expect(source).toMatch(/function sameRows\(/);
    expect(source).toMatch(/return sameRows\(current, out\) \? current : out/);
  });
});
