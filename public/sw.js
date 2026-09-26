/*
 * Service worker for PÉTRAV.
 *
 * A forecourt office is exactly where the signal drops out, so the shell is
 * cached on install and stays usable offline. Data requests are never cached:
 * a stale fuel price or stock level is worse than an honest error, because
 * someone would act on it.
 */

/*
 * Cache namespace version.
 *
 * MUST be bumped in the same change as any edit to `src/styles.css` or to any
 * JSX file under `src/pages/`. Those edits give Vite's output new content
 * hashes, so a shell cached from the previous deploy names bundle filenames
 * the new deploy no longer serves — the phone then boots a blank screen until
 * site data is cleared by hand. Bumping the version renames every cache, and
 * the activate handler below deletes the old ones.
 *
 * `npm run check:sw-version` enforces this locally and in CI; the pull request
 * template carries the same reminder.
 */
const VERSION = "v8";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

/*
 * The app may be served from a subpath (GitHub Pages project sites are
 * /<repo>/), so nothing here may assume the origin root. The worker's own
 * location gives the base it was registered under: /gas_station/sw.js means
 * a base of /gas_station/.
 */
const BASE = self.location.pathname.replace(/sw\.js$/, "");
const SHELL_URL = `${BASE}index.html`;

// Enough to boot the app offline; hashed bundles are added as they are hit.
const SHELL_URLS = [
  BASE,
  SHELL_URL,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon-192.png`,
  `${BASE}logo.svg`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Supabase REST, Auth, Realtime and Edge Functions must always use the network. */
function isData(url) {
  return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in");
}

/**
 * Navigations are network-first, with the cached shell as a failure fallback.
 *
 * The shell is not a stable document: it names content-hashed bundles, so the
 * copy in the cache is only correct for the deploy it came from. Serving it
 * first (as this worker used to) meant a returning phone re-ran the previous
 * deploy's HTML against assets that may no longer exist — a blank screen that
 * only clearing site data could fix. Asking the network first costs one
 * request on a connection that is working, and the cached shell still answers
 * the moment the request actually fails, which is the case offline support was
 * for.
 *
 * Every successful response refreshes the cached shell, so the offline copy is
 * always the last one the phone saw working.
 */
async function networkFirstShell(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      // GitHub Pages answers an unknown deep link with 404.html (a copy of the
      // shell). That still boots the router, but it is not worth caching as
      // the canonical shell, hence the `ok` guard.
      const copy = res.clone();
      caches
        .open(SHELL)
        .then((c) => c.put(SHELL_URL, copy))
        .catch(() => undefined);
    }
    return res;
  } catch {
    // Offline, or the request died in poor signal: this is the only case in
    // which a cached shell may answer a navigation.
    const cached = (await caches.match(SHELL_URL)) || (await caches.match(BASE));
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isData(url)) return;
  if (url.origin !== self.location.origin) return;

  // Navigations: fetch the current deploy's shell, fall back to the cached one
  // only when the network fails. The router takes over from there.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Built assets are content-hashed, so a cache hit is always correct.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res.ok && (res.type === "basic" || res.type === "default")) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
    })
  );
});
