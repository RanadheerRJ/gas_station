/*
 * Service worker for PumpMithra.
 *
 * A forecourt office is exactly where the signal drops out, so the shell is
 * cached on install and served from cache first. Data requests are never
 * cached: a stale fuel price or stock level is worse than an honest error,
 * because someone would act on it.
 */

const VERSION = "v3";
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isData(url)) return;
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the app shell so a deep link works offline. The router
  // takes over from there.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match(BASE)))
    );
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
