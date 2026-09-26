# What this changes

<!-- One or two sentences. What is different for the person using the app? -->

## Checks

- [ ] `npm run check` passes (lint, format, tests, build).
- [ ] **Service worker cache version.** If this pull request touches
      `src/styles.css` or any `src/pages/**/*.jsx`, `const VERSION` in
      `public/sw.js` is bumped (`v6` → `v7`, …). Those files change the
      content hashes of the built bundles, and the service worker caches the
      shell that names them: without a bump, a phone that already has the site
      open or installed keeps the previous deploy's shell and asks for bundle
      filenames this deploy no longer publishes. `npm run check:sw-version`
      checks this, and CI runs it on every pull request.
- [ ] Database changes ship as a new migration, never as an edit to an applied
      one, and `npm run check:schema` / `npm run test:rbac` pass.
- [ ] Touch UI checked at 375px and 390px wide — nothing important is clipped,
      and every tap target is still at least 40px tall.

## How it was tested

<!-- Commands run, screens opened, devices used. -->
