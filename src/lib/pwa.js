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

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // An unavailable service worker costs offline support, nothing more.
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
