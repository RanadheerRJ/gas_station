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
