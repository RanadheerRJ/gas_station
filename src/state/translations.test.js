import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DICTIONARIES,
  LANGUAGES,
  LANGUAGE_NAMES,
  TRANSLATION_KEYS,
} from "./translations.js";
import { DEFAULT_LANGUAGE, pluralKey, translate } from "./LanguageContext.jsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

/** Every .jsx/.js file under src, so the test sees the whole interface. */
function sourceFiles(dir = SRC, found = []) {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, found);
    if (/\.jsx?$/.test(entry.name) && !entry.name.endsWith(".test.js")) found.push(path);
    return undefined;
  });
  return found;
}

describe("language set", () => {
  it("offers English, Telugu, and Hindi", () => {
    expect(LANGUAGES).toEqual(["en", "te", "hi"]);
  });

  it("names each language in its own script", () => {
    expect(LANGUAGE_NAMES.en).toBe("English");
    expect(LANGUAGE_NAMES.te).toBe("తెలుగు");
    expect(LANGUAGE_NAMES.hi).toBe("हिंदी");
  });

  it("defaults to English", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });
});

describe("dictionary coverage", () => {
  it("has a non-empty dictionary for every language", () => {
    LANGUAGES.forEach((code) => {
      expect(Object.keys(DICTIONARIES[code]).length).toBeGreaterThan(0);
    });
  });

  // This is the assertion that stops a missing key ever reaching a user:
  // untranslated copy fails here rather than rendering English (or a raw key)
  // on a Telugu or Hindi screen.
  it.each(["te", "hi"])("%s translates every English key", (code) => {
    const missing = TRANSLATION_KEYS.filter((key) => !DICTIONARIES[code][key]);
    expect(missing).toEqual([]);
  });

  it.each(["te", "hi"])("%s has no keys English does not", (code) => {
    const extra = Object.keys(DICTIONARIES[code]).filter((key) => !DICTIONARIES.en[key]);
    expect(extra).toEqual([]);
  });

  it.each(LANGUAGES)("%s leaves no value blank", (code) => {
    const blank = Object.entries(DICTIONARIES[code])
      .filter(([, value]) => !String(value).trim())
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it("keeps the same placeholders in every translation of a key", () => {
    const placeholders = (text) => (String(text).match(/\{(\w+)\}/g) || []).sort();
    const mismatched = [];
    TRANSLATION_KEYS.forEach((key) => {
      const expected = placeholders(DICTIONARIES.en[key]);
      LANGUAGES.filter((code) => code !== "en").forEach((code) => {
        const actual = placeholders(DICTIONARIES[code][key]);
        if (actual.join(",") !== expected.join(",")) mismatched.push(`${code}:${key}`);
      });
    });
    expect(mismatched).toEqual([]);
  });

  it("actually translates rather than copying the English through", () => {
    // A handful of keys are legitimately identical across scripts (UPI, MS/HSD
    // product codes), but the bulk must genuinely differ.
    const identical = TRANSLATION_KEYS.filter(
      (key) => DICTIONARIES.te[key] === DICTIONARIES.en[key]
    );
    expect(identical.length).toBeLessThan(TRANSLATION_KEYS.length * 0.05);
  });
});

describe("every key the interface asks for exists", () => {
  // Catches the other direction: a t("...") call in a component whose key was
  // never added to the dictionary would otherwise render the raw key on screen.
  it("resolves every literal t() key used in src", () => {
    const unknown = new Set();
    sourceFiles().forEach((file) => {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*"([\w.]+)"/g)) {
        if (!DICTIONARIES.en[match[1]]) unknown.add(`${match[1]} (${file})`);
      }
    });
    expect([...unknown]).toEqual([]);
  });

  it("resolves every literal key passed to tn()", () => {
    const unknown = new Set();
    sourceFiles().forEach((file) => {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /\btn\(\s*[^,]+,\s*"([\w.]+)"\s*,\s*"([\w.]+)"/g
      )) {
        [match[1], match[2]].forEach((key) => {
          if (!DICTIONARIES.en[key]) unknown.add(`${key} (${file})`);
        });
      }
    });
    expect([...unknown]).toEqual([]);
  });
});

describe("translate", () => {
  it("returns the string for the active language", () => {
    expect(translate("en", "chrome.signOut")).toBe("Sign out");
    expect(translate("te", "chrome.signOut")).toBe("సైన్ అవుట్");
    expect(translate("hi", "chrome.signOut")).toBe("साइन आउट");
  });

  it("fills placeholders", () => {
    expect(translate("en", "report.rowCount", { count: 12 })).toBe("12 rows in range");
    expect(translate("hi", "owner.toReview", { count: 3 })).toContain("3");
  });

  it("leaves an unsupplied placeholder alone rather than printing undefined", () => {
    expect(translate("en", "report.rowCount", {})).toBe("{count} rows in range");
  });

  it("falls back to English for an unknown language", () => {
    expect(translate("fr", "chrome.signOut")).toBe("Sign out");
  });

  it("returns the key itself only for a genuinely unknown key", () => {
    expect(translate("te", "no.such.key")).toBe("no.such.key");
  });

  it("never renders the word undefined", () => {
    LANGUAGES.forEach((code) => {
      TRANSLATION_KEYS.forEach((key) => {
        expect(translate(code, key)).not.toContain("undefined");
      });
    });
  });
});

describe("pluralKey", () => {
  it("picks the singular for exactly one", () => {
    expect(pluralKey(1, "stock.tank", "stock.tanks")).toBe("stock.tank");
  });

  it("picks the plural for zero and many", () => {
    expect(pluralKey(0, "stock.tank", "stock.tanks")).toBe("stock.tanks");
    expect(pluralKey(7, "stock.tank", "stock.tanks")).toBe("stock.tanks");
  });
});

describe("raw user data is never translated", () => {
  it("has no dictionary entry that looks like seeded customer or staff data", () => {
    const values = LANGUAGES.flatMap((code) => Object.values(DICTIONARIES[code]));
    ["Amy Attendant", "Acme Transport", "Suresh Babu", "Sri Balaji"].forEach((name) => {
      expect(values.some((value) => String(value).includes(name))).toBe(false);
    });
  });
});
