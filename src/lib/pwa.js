/**
 * Progressive-web-app plumbing: service-worker registration and the
 * connectivity signal the UI shows.
 *
 * Registration is deliberately skipped in development — a cached shell while
 * editing source is a debugging trap, and Vite already serves instantly.
 */

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  // The worker must be requested from under the deployment base, otherwise
  // its scope would not cover the app and it would 404 on a project site.
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swUrl).catch(() => {
      // An unavailable service worker costs offline support, nothing more,
      // so a failure here is deliberately swallowed.
      return undefined;
    });
  });
}

/**
 * Is this an iPhone, iPod, or iPad? iPadOS 13+ reports a Mac user agent, so
 * a multi-touch "MacIntel" platform is an iPad, not a Mac. Pure and
 * parameterised so the rule is testable without faking a whole navigator.
 */
export function isIosDevice(userAgent = "", platform = "", maxTouchPoints = 0) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** Is the app already running installed (standalone), not in a browser tab? */
export function isStandaloneDisplay(matchMediaFn, navigatorStandalone) {
  if (navigatorStandalone === true) return true; // iOS Safari's own flag
  if (typeof matchMediaFn !== "function") return false;
  try {
    return Boolean(matchMediaFn("(display-mode: standalone)").matches);
  } catch {
    return false;
  }
}

/**
 * Should the "add to home screen" guidance show, and in which form?
 *
 * Android Chrome hands the app a `beforeinstallprompt` event, so it can
 * offer a real Install button. iOS Safari never fires that event — the only
 * route is Share → Add to Home Screen — so iOS gets instructions instead,
 * and only while the app is not already installed.
 *
 * Returns "prompt" (Android-style button), "ios" (instructions), or null.
 */
export function installGuidance({ deferredPrompt, ios, standalone, dismissed }) {
  if (dismissed || standalone) return null;
  if (deferredPrompt) return "prompt";
  if (ios) return "ios";
  return null;
}

/** Subscribe to online/offline transitions. Returns an unsubscribe function. */
export function watchConnection(onChange) {
  const emit = () => onChange(navigator.onLine);
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
  emit();
  return () => {
    window.removeEventListener("online", emit);
    window.removeEventListener("offline", emit);
  };
}

/**
 * Hard-refresh the app: deletes all CacheStorage caches, unregisters active
 * service worker registrations, and reloads the page with a cache-busting
 * timestamp so any client on an outdated build loads the latest version.
 */
export async function hardRefreshApp() {
  try {
    if (typeof window !== "undefined" && "caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch (error) {
    console.warn("Error clearing cache during hard refresh:", error);
  }
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.set("_reload", Date.now().toString());
    window.location.replace(url.toString());
  }
}
