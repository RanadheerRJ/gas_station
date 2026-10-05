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
