# PROJECT RULES FOR THE PETRAV UI REDESIGN

Goal: make the whole app look and behave like a modern food-delivery app (DoorDash / Uber Eats interaction patterns: card-first, large tap targets, chips, bottom tabs, sticky action bars, bottom sheets, skeleton loaders). Do NOT copy any real brand's logos, colors, icons, illustrations or copy.

Hard constraints:

1. Do not change src/lib/api.js, src/lib/supabase.js, supabase/ migrations, or any role/RLS behavior. UI only.
2. Every user-visible string goes through the translation system. Add each new key to src/state/locales/en.js, hi.js AND te.js; src/state/translations.test.js fails otherwise.
3. All styling uses the CSS variables in src/styles/tokens.css. No hard-coded hex colors in components. Light and dark themes must both work.
4. No new dependencies. Plain CSS + React as today.
5. Keep every existing route and role path in src/App.jsx working. Do not rename routes.
6. Mobile first: design for a 375px-wide phone, then widen. Tap targets at least 44px. Respect prefers-reduced-motion.
7. Keep accessibility: real buttons and links, aria-labels, visible focus ring, color is never the only signal.
8. Money keeps its meaning: green = in, red = out/short, amber = credit/over.
9. Existing tests must keep passing. Update tests only when markup legitimately changed, and keep their intent.
10. After each prompt run: npm run check (lint, format, tests, sw-version, build). Fix everything before finishing. If you change files cached by the service worker, run the sw version check and bump as the repo requires.

Workflow for every screen: (a) read the screen and its test files, (b) list every button, link, card and row that is not clickable or has no hover/pressed/focus state, (c) implement the redesign, (d) make every visible control either work or be removed, (e) run npm run check, (f) summarize what changed in 5 bullets.
