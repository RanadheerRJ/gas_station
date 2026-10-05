# Bundle analysis

Measured on the production build (`npm run build`, Vite 7) by attributing every
byte of each output chunk back to its source module through the build
sourcemaps. Figures are raw (pre-gzip) kB unless stated otherwise.

## Where the bytes are

| Chunk            |    Raw |   Gzip | Loaded                                |
| ---------------- | -----: | -----: | ------------------------------------- |
| `supabase`       | 217.75 |  57.06 | every session, at startup             |
| `vendor`         | 187.46 |  61.35 | every session, at startup             |
| `index`          |  55.69 |  17.23 | every session, at startup             |
| `en` (locale)    |  25.46 |   8.34 | on startup for English (active lang)  |
| `hi` (locale)    |  44.58 |  10.28 | on startup / switch to Hindi          |
| `te` (locale)    |  49.81 |  10.59 | on startup / switch to Telugu         |
| `index.css`      |  79.26 |  14.83 | every session, at startup             |
| route chunks     | ≤ 24.09| ≤ 5.56 | on navigation (lazy)                  |

Route-level code splitting and locale chunk splitting keep the initial startup footprint lean.
`index.js` dropped from **159.85 kB raw / 42.01 kB gzip** down to **55.69 kB raw / 17.23 kB gzip** (~24.8 kB gzip reduction in entry payload).

### `supabase` — 217.8 kB

| Package                    |   Raw | Used by this app                          |
| -------------------------- | ----: | ----------------------------------------- |
| `@supabase/auth-js`        | 102.1 | yes — PIN login, session refresh          |
| `@supabase/realtime-js`    |  31.8 | **no** — no `.channel()` call anywhere    |
| `@supabase/phoenix`        |  25.2 | **no** — realtime's websocket transport   |
| `@supabase/storage-js`     |  22.4 | **no** — no file uploads                  |
| `@supabase/postgrest-js`   |  17.1 | yes — every table read and RPC            |
| `@supabase/supabase-js`    |  11.0 | yes — the client itself                   |
| `@supabase/functions-js`   |   2.8 | yes — the `accounts` Edge Function        |

Roughly 79 kB raw (~26% of the chunk) is realtime, its Phoenix transport, and
storage, none of which this app calls. It is nonetheless **not removable
safely**: `createClient` constructs `SupabaseClient`, whose constructor
instantiates the realtime and storage sub-clients eagerly, so the imports are
not dead code as far as Rollup is concerned. The only ways to drop them are
aliasing those packages to stubs or hand-editing the client — both risk
breaking auth token refresh and RPC calls at runtime for a one-off ~20 kB gzip
win, so neither was done.

Worth revisiting when `@supabase/supabase-js` ships a modular/lazy client
(tracked upstream); at that point the win is real and safe.

### `vendor` — 187.5 kB

| Package        |   Raw |
| -------------- | ----: |
| `react-dom`    | 127.3 |
| `react-router` |  38.2 |
| `react`        |   7.3 |
| `iceberg-js`   |   5.3 |
| `scheduler`    |   3.9 |
| `tslib`        |   0.6 |

Essentially irreducible. `react-router` grew from ~22 kB to 38.2 kB in the v6→v7
upgrade (vendor went 171.0 → 187.5 kB raw, 55.7 → 61.4 kB gzip); that is the
price of the supported major and is not recoverable while using the router.

### `index` — 55.7 kB (previously 159.9 kB)

| Module                     |   Raw |
| -------------------------- | ----: |
| `src/lib/api.js`            |  10.5 |
| `src/components/Layout.jsx` |   5.9 |
| `src/App.jsx`               |   4.7 |
| `src/components/icons.jsx`  |   4.6 |
| `src/state/translations.js` |   1.2 |
| everything else             |  ~28  |

## The translations split: Implemented via Pre-Mount Loader

The three language dictionaries (`en`, `te`, `hi`) are code-split into standalone modules in `src/state/locales/`.
The active language preference is resolved from `localStorage` / `navigator.language` and loaded asynchronously in `src/main.jsx` **before** React mounts.

- `t()` remains completely synchronous inside component rendering.
- There is **no flash of untranslated text** on first paint for Telugu or Hindi users.
- When an operator switches language in the UI, `loadDictionary()` dynamically fetches the target language chunk before updating state.
- `src/state/translations.test.js` continues to statically verify dictionary coverage (0 missing keys, 0 placeholder mismatches) across all languages.

## Stylesheet Modularization

`src/styles.css` is organized into logical domain modules under `src/styles/`:
- `tokens.css`: Color palettes, dark mode variables, typography, sizing tokens.
- `base.css`: Global resets, box-sizing, typography, content containers.
- `layout.css`: Mobile top bar, desktop sidebar, screen header, bottom tab bar, sheets.
- `components.css`: Buttons, input fields, tables, stat strips, tags, notices, variance pills.
- `shifts.css`: Forecourt shift running, step progress, meter readings, close-shift flow.
- `views.css`: Ground stock tank visualizer, price boards, admin console, login cards.
- `motion.css`: Keyframes, transitions, skeletons, reduced-motion overrides.
- `responsive.css`: Consolidated mobile & narrow-phone media queries.

Vite bundles these via `@import` rules into a single production CSS bundle (`index.css`), preserving 100% cascade order without runtime CSS overhead.

## Summary

| Optimization                         | Result                                                     | Status      |
| ------------------------------------ | ---------------------------------------------------------- | ----------- |
| Lazy-load active language dictionary | **~24.8 kB gzip reduction** on entry `index.js` bundle     | Completed   |
| Modularize monolithic stylesheet     | Split 5.7k lines into cohesive domain CSS modules          | Completed   |
| Service worker cache busting         | Bumped to `v11` with `WATCHED_PATTERNS` covering all styles | Completed   |
| Test suite & static analysis         | 34 test files (431 tests) passing, 0 ESLint warnings       | Passing 100%|
