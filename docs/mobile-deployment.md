# Mobile deployment: installable PWA for iOS and Android

PÉTRAV ships to phones as an **installable progressive web app (PWA)** — the
same React/Vite build that deploys to GitHub Pages. There is no separate
native codebase, no app-store listing, and no signing step: users install
the web app onto their home screen, after which it launches full-screen
with its own icon, splash screen, and offline shell.

This is a deliberate scope line. A Play Store / App Store listing would
need a native wrapper (e.g. Capacitor), store developer accounts, review,
and a second release pipeline; none of that changes what the app does on
the forecourt. Everything below is what "ready for iOS and Android" means
for this project today, and what is guarded so it stays true.

## What each platform gets

| Surface | Android (Chrome) | iOS (Safari) |
| --- | --- | --- |
| Install | In-app **Install** bar (`beforeinstallprompt`), or Chrome menu → *Install app* | In-app guidance bar — Safari never fires `beforeinstallprompt`, so the bar teaches **Share → Add to Home Screen** |
| Icon | `icon-192/512.png`, `icon-maskable-512.png` (adaptive) | `apple-touch-icon.png` (180×180) |
| Launch screen | Manifest `background_color` (`#063B8F`) + icon | `apple-touch-startup-image` — one exact-size PNG per device class in `public/splash/` |
| Full screen | `display: standalone` | `apple-mobile-web-app-capable` + standalone display |
| Notch / gesture bar | `viewport-fit=cover` + `env(safe-area-inset-*)` padding throughout | same |
| Offline | Service worker (`public/sw.js`): shell cached, data never cached | same |
| Updates | Next navigation fetches the current deploy; see "Updating an installed app" | same |

The install bar lives in `src/components/Layout.jsx`; the decision of
which form it takes (real prompt, iOS instructions, or silence once
installed/dismissed) is `installGuidance()` in `src/lib/pwa.js`, pinned
by `src/lib/pwa.test.js`.

## Deploying

The phone app and the website are one artifact. Deploying is the normal
GitHub Pages flow (see the README's deployment checklist):

1. Set the repository Actions **variables** `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions).
   The anon key is public by design; RLS is the boundary. Never add the
   service-role key.
2. Apply migrations and deploy the `accounts` function
   (`supabase db push`, `supabase functions deploy accounts`) — automated
   from `main` by `deploy-supabase.yml` after first setup.
3. Push to `main` (or run **Deploy to GitHub Pages** manually). The site
   must be served over **HTTPS** — service workers and installation are
   refused on plain HTTP, GitHub Pages provides HTTPS by default.
4. Serving from a different base path (a renamed repository, a custom
   domain at the root) needs no code edits: build with
   `BASE_PATH=/ npm run build`. The manifest's `start_url`/`scope` are
   relative (`.`) and the service worker derives its base from its own
   URL, so both follow the deployment wherever it lands.

## Installing (what to tell staff)

**Android:** open the site in Chrome, sign in once, and tap **Install**
on the bar at the bottom. If the bar was dismissed, Chrome's ⋮ menu →
*Install app* does the same thing.

**iPhone/iPad:** open the site in Safari, tap **Share**, then
**Add to Home Screen**. The in-app bar says exactly this until the app is
installed or the bar is dismissed. It must be Safari — other iOS browsers
cannot add to the home screen.

Sign-in, data, and roles are identical installed or in a tab; the
installed app is the same origin with the same `localStorage` and
Supabase session.

## The guardrail: `npm run check:pwa`

Installability is a contract spread over the manifest, the icons, the
splash screens, `index.html`, and the service worker, and none of them
fails loudly when another drifts — the failure mode is a phone that
quietly cannot install. `scripts/checkPwa.mjs` verifies the whole
contract from the shipped files:

- the manifest parses and has the fields Android requires, including
  192/512 `any` PNG icons and a 512 `maskable` icon;
- every manifest icon exists and its real PNG dimensions match `sizes`;
- `index.html` carries the install meta tags for both platforms,
  `viewport-fit=cover`, and links the manifest and Apple touch icon;
- every `apple-touch-startup-image` link resolves to a splash PNG whose
  dimensions match its `splash-<width>x<height>.png` name and whose media
  query names a device size — and no splash file on disk is left
  unlinked;
- the service worker still declares its `vN` cache version.

It runs as part of `npm run check` and as a step in the Tests workflow.
Regenerate splash screens (and all icons) with:

```bash
npm i --no-save sharp
node scripts/branding/build-branding.mjs
```

`--no-save` is deliberate: sharp is a build-time asset tool only, never
an app dependency.

## Updating an installed app

There is nothing for staff to do and no store review to wait for:

- A navigation is network-first, so the next launch after a deploy is
  normally the new deploy. One stale first load can happen on the very
  first upgrade from an old cache-first worker (see
  `docs/device-test/README.md`).
- Any change to `src/styles/**` or `src/pages/**` must bump
  `const VERSION` in `public/sw.js` in the same PR —
  `npm run check:sw-version` enforces it, and bumping is what makes
  installed phones drop the previous deploy's caches.
- Account → **Hard refresh** remains the escape hatch: it clears caches,
  unregisters the worker, and reloads.

## Known platform limits (accepted, not bugs)

- **No store presence.** The app is not discoverable in the Play Store
  or App Store and cannot be found by searching them; distribution is
  the site URL.
- **iOS install is manual.** Apple offers no install prompt API, so the
  Share-sheet guidance bar is the best available affordance.
- **iOS storage eviction.** Safari may evict an installed PWA's storage
  after weeks of non-use; the next launch simply signs in again. No app
  data lives only on the device — Supabase is the source of truth.
- **No push notifications or background sync** on iOS for web apps in
  the form this app needs; nothing in the product depends on them.
- If store distribution ever becomes a requirement, the path is a
  Capacitor wrapper around this same `dist/` output — the PWA work
  above (manifest, icons, splash screens, safe areas) carries over
  unchanged.
