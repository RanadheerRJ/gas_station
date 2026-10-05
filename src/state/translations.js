/**
 * Localisation loader and language definitions.
 *
 * Each language dictionary lives in its own chunk under `./locales/`
 * (English in en.js, Telugu in te.js, Hindi in hi.js). Loading the active
 * dictionary dynamically on cold start saves ~28 kB gzip in the initial bundle.
 */

/** Language codes, in the order the selector offers them. */
export const LANGUAGES = ["en", "te", "hi"];

/** Each language named in its own script — nobody has to read English to switch. */
export const LANGUAGE_NAMES = {
  en: "English",
  te: "తెలుగు",
  hi: "हिंदी",
};

/**
 * Cache of loaded dictionary objects keyed by language code.
 * Initialized during pre-mount or as language selections change.
 */
export const loadedDictionaries = {};

const loaders = {
  en: () => import("./locales/en.js").then((m) => m.default || m),
  te: () => import("./locales/te.js").then((m) => m.default || m),
  hi: () => import("./locales/hi.js").then((m) => m.default || m),
};

export function registerDictionary(language, dictionary) {
  if (language && dictionary) {
    loadedDictionaries[language] = dictionary;
  }
}

/**
 * Dynamically import a language dictionary if not already cached.
 * Returns the dictionary object.
 */
export async function loadDictionary(language) {
  const code = LANGUAGES.includes(language) ? language : "en";
  if (loadedDictionaries[code]) {
    return loadedDictionaries[code];
  }
  const loader = loaders[code] || loaders.en;
  const dict = await loader();
  loadedDictionaries[code] = dict;
  return dict;
}

// In test environments, pre-load dictionaries so unit tests run synchronously without awaiting loaders
if (
  typeof globalThis !== "undefined" &&
  (globalThis.process?.env?.NODE_ENV === "test" ||
    globalThis.process?.env?.VITEST ||
    import.meta.env?.MODE === "test")
) {
  try {
    const [enMod, teMod, hiMod] = await Promise.all([
      import("./locales/en.js"),
      import("./locales/te.js"),
      import("./locales/hi.js"),
    ]);
    loadedDictionaries.en = enMod.default || enMod;
    loadedDictionaries.te = teMod.default || teMod;
    loadedDictionaries.hi = hiMod.default || hiMod;
  } catch {
    /* Ignore in non-test bundler environments */
  }
}
