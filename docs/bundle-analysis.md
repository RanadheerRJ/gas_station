# Bundle analysis

Measured on the production build (`npm run build`, Vite 7) by attributing every
byte of each output chunk back to its source module through the build
sourcemaps. Figures are raw (pre-gzip) kB unless stated otherwise.

## Where the bytes are

| Chunk      |    Raw |   Gzip | Loaded                    |
| ---------- | -----: | -----: | ------------------------- |
| `supabase` | 217.75 |  57.06 | every session, at startup |
| `vendor`   | 187.46 |  61.35 | every session, at startup |
| `index`    | 159.85 |  42.01 | every session, at startup |
| `index.css`|  56.36 |  10.99 | every session, at startup |
| route chunks | ≤ 15.29 | ≤ 5.01 | on navigation (lazy)    |

Route-level code splitting is already doing its job: the largest screen
(`ShiftDetail`) is 15.3 kB / 3.9 kB gzip and nothing over 13 kB loads until the
user navigates there. The remaining weight is all in the three startup chunks.

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

### `index` — 159.9 kB

| Module                     |   Raw |
| -------------------------- | ----: |
| `src/state/translations.js` |  66.3 |
| `src/lib/api.js`            |  10.5 |
| `src/components/Layout.jsx` |   5.9 |
| `src/App.jsx`               |   4.7 |
| `src/components/icons.jsx`  |   4.6 |
| everything else             |  ~68  |

**41% of the entry chunk is the three-language dictionary.** The English, Telugu
and Hindi dictionaries are ~25 kB of source each; the two a given device will
never use are dead weight on every startup — on the order of 18 kB gzip.

## The translations split: measured, and deliberately not done

Splitting `DICTIONARIES` into three chunks and loading only the active one is
the single largest available win, and it is mechanically easy (three modules
plus `import.meta.glob`). It was **not** implemented, because it cannot be done
without an observable behaviour change:

- `translate()` is synchronous and is called during render by `t()` in every
  component. A dynamically imported dictionary is not available on the first
  paint.
- That leaves two options, both user-visible: a Telugu or Hindi device renders
  the English fallback for a frame and then re-renders (a flash of the wrong
  language on the login screen, on every cold load), or the provider gates the
  whole app behind a loading state until the dictionary arrives (a new blank
  frame for the majority of users, since the forecourt staff this app is built
  for are precisely the non-English readers).
- The cost lands on the users who read Telugu or Hindi, to save bytes for the
  ones who read English — the wrong way round for a station app.

A clean version needs the language to be resolved before React mounts (for
example, awaiting the dictionary import in `src/main.jsx` before
`createRoot().render()`, which keeps `t()` synchronous and adds no flash, at the
cost of a serialised request on cold load). That is a real design decision about
startup sequencing rather than a refactor, so it is left for a deliberate change
rather than folded into maintenance work.

Preserved constraint either way: `src/state/translations.test.js` asserts that
every key in `en` exists in `te` and `hi`. Any split must keep the dictionaries
statically importable by that test.

## Summary

| Candidate                            | Gzip saving | Verdict                                  |
| ------------------------------------ | ----------: | ---------------------------------------- |
| Lazy-load one language dictionary     |     ~18 kB | Deferred — needs a pre-mount language gate to avoid a visible flash |
| Drop unused supabase realtime/storage |     ~20 kB | Rejected — only achievable with aliasing hacks that risk auth/RPC   |
| Further route splitting               |      < 2 kB | Not worth it — largest route chunk is already 3.9 kB gzip           |
