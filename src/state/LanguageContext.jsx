import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DICTIONARIES, LANGUAGES, LANGUAGE_NAMES } from "./translations.js";

/**
 * Lightweight localisation.
 *
 * Deliberately not an i18n library: this app needs string lookup and one
 * placeholder substitution, and a dependency for that would cost more in
 * bundle size than the entire dictionary. `t("shifts.title")` reads a key out
 * of the active dictionary; `t("stock.tanks", { count: 3 })` fills the braces.
 *
 * The preference is per-device and survives a reload, because the person on
 * the forecourt and the person in the office often share one owner account
 * but not one language.
 */

const LanguageContext = createContext(null);
const KEY = "petrav.language";
/* Devices upgraded from the pre-rename build keep their saved language
   under the old key; read it until the new one is written. */
const LEGACY_KEY = "pumpmithra.language";
export const DEFAULT_LANGUAGE = "en";

function preferredLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  let saved = window.localStorage?.getItem(KEY);
  if (saved == null) saved = window.localStorage?.getItem(LEGACY_KEY);
  if (LANGUAGES.includes(saved)) return saved;
  // A device already set to Telugu or Hindi should not have to be told twice.
  const browser = String(window.navigator?.language || "").slice(0, 2);
  return LANGUAGES.includes(browser) ? browser : DEFAULT_LANGUAGE;
}

/**
 * Resolve one key.
 *
 * English is the fallback for a key a translation is missing, and the key
 * itself is the last resort — which only ever surfaces for a genuinely
 * unknown key, never for missing copy, because the dictionaries are asserted
 * complete by `src/state/translations.test.js`.
 */
export function translate(language, key, vars) {
  const dictionary = DICTIONARIES[language] || DICTIONARIES[DEFAULT_LANGUAGE];
  const text = dictionary[key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Pick between a singular and a plural key on `count`.
 * English, Telugu and Hindi all take the same two-form shape here.
 */
export function pluralKey(count, singularKey, pluralisedKey) {
  return Number(count) === 1 ? singularKey : pluralisedKey;
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(preferredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage?.setItem(KEY, language);
    } catch {
      /* private browsing can refuse storage; the session still works */
    }
  }, [language]);

  const setLanguage = useCallback((next) => {
    setLanguageState(LANGUAGES.includes(next) ? next : DEFAULT_LANGUAGE);
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      languages: LANGUAGES,
      languageNames: LANGUAGE_NAMES,
      t: (key, vars) => translate(language, key, vars),
      /** `tn(2, "stock.tank", "stock.tanks")` → the right form, count filled in. */
      tn: (count, singularKey, pluralisedKey) =>
        translate(language, pluralKey(count, singularKey, pluralisedKey), { count }),
    }),
    [language, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}

/** The selector used on the login card and in the authenticated sidebar. */
export function LanguageSelect({ className = "", compact = false }) {
  const { language, setLanguage, languages, languageNames, t } = useLanguage();
  return (
    <label className={`field language-select ${className}`.trim()}>
      {!compact && <span>{t("chrome.language")}</span>}
      <select
        value={language}
        aria-label={t("chrome.language")}
        onChange={(event) => setLanguage(event.target.value)}
      >
        {languages.map((code) => (
          <option key={code} value={code}>
            {languageNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
