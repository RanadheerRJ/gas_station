import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

const KEY = "petrav.theme";
/* Devices upgraded from the pre-rename build keep their saved theme under
   the old key; read it until the new one is written. */
const LEGACY_KEY = "pumpmithra.theme";

function preferredTheme() {
  if (typeof window === "undefined") return "light";
  let saved = window.localStorage.getItem(KEY);
  if (saved == null) saved = window.localStorage.getItem(LEGACY_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(preferredTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // The status bar above the app carries the brand blue in light mode and
    // sinks into the dark surface at night.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0f16" : "#063b8f");
  }, [theme]);
  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme]
  );
  useEffect(() => window.localStorage.setItem(KEY, theme), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
