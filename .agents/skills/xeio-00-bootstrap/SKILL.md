---
name: xeio-00-bootstrap
description: Phase 0 of the XeIO build. Scaffold the repo, tooling, test harnesses (unit, PGlite DB, Playwright), Cloudflare headers, the release gate, design tokens and the shared UI kit. Use only at the start of the build.
---

# Phase 0: Bootstrap

## Plan artifact (write first, wait for approval)

List the files below, the exact dependency versions you will pin, and how each test layer runs.

## Steps

1. **Project**
   - `npm init`; Vite + React 19 + TypeScript strict; react-router-dom v7.
   - Multi-page build: `index.html` (landing) and `app/index.html` (SPA, basename `/app`).
   - Path aliases are optional; keep imports relative if simpler.
   - Scripts: `dev`, `build` (vendor → tsc → vite build → `node scripts/postbuild-check.mjs`), `preview`, `typecheck`, `lint`, `test`, `test:db`, `test:e2e`, `audit`, `check` (all gates).
2. **Lint:** ESLint flat config with typescript-eslint, react-hooks and eslint-plugin-security. A Node-globals block for `scripts/**` and `tests/e2e/server.mjs`. Ignore `dist`, `public/vendor` and `public/models`.
3. **Fonts and vendor:** `@fontsource` IBM Plex Sans, Mono and Serif. `scripts/copy-vendor.mjs` (also run on `postinstall`) copies the MediaPipe wasm into `public/vendor/mediapipe` and the face model from `vendor-assets/` into `public/models`. Add the face model in phase 7; create the script now.
4. **Design system:** `src/styles.css` with the tokens and component classes from rule 03. `src/components/ui.tsx` with `Wordmark`, `Elzeo` (placeholder until the user gives the logo SVGs), `Card`, `Chip`, `Banner`, `Seg`, `PageHead`, `Empty`, `Loading`, `ErrorNote`, `Stepper`, `Modal`, `Bar`, `Kpis` and `statusTone`.
5. **Lib:**
   - `src/lib/supabase.ts`: client from env; `rpc<T>(name, args)` throws `Error(code)`; `fn<T>(name, body)` for edge functions; `must()` unwraps `{data, error}`.
   - `src/lib/hooks.ts`: `useLoad` with a stale-request guard, `useAction` with busy state and a message, `useNow`.
   - `src/lib/errors.ts`: code → plain message map with a generic fallback.
   - `src/lib/format.ts`: IST dates and times, `todayIso`.
6. **Cloudflare:**
   - `public/_headers` per rule 04 (CSP per path; Permissions-Policy camera/mic/display-capture only on `/app/*`).
   - `public/_redirects` with `/app/* /app/index.html 200`.
   - `public/robots.txt`. The sitemap is generated at build from `VITE_SITE_URL`.
7. **Release gate:** `scripts/postbuild-check.mjs` scans `dist/` and fails on:
   - secret patterns (`service_role`, `eyJ` JWTs that are not the anon key, `sk-`, `-----BEGIN`)
   - `.map` files
   - files over 25 MiB
   - inline `<script>` without src
   - missing `_headers`, `_redirects`, robots or sitemap
   - a CSP missing on `/` or `/app/*`
8. **Tests:**
   - Vitest config (jsdom for components, node for logic).
   - `tests/db/harness.ts`: PGlite with a Supabase stand-in — schemas `auth` and `storage`, roles `anon`, `authenticated` and `service_role`, `auth.users`, `auth.uid()` from `request.jwt.claim.sub`, default privileges — plus `freshDb()`, `as(db, uid, fn)` and `err(promise)`. It applies every file in `supabase/migrations` in order.
   - Playwright config with Chrome; `tests/e2e/server.mjs` serves `dist/`, applies `_headers` and `_redirects`, and mocks nothing (mocks live in the specs via `page.route`).
   - `scripts/screens/` holds the screen-check spec and config (mock Supabase, screenshot each screen, fail on `pageerror`).
9. **Supabase folder:** `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`, `supabase/functions/_shared/` (`http.ts` for CORS, POST guard, body cap and json helper; `clients.ts` for admin and as-user clients).
10. **Docs:** README (what, stack, run locally, tests), DEPLOY (placeholder sections), SECURITY (threat model outline), TEST-REPORT (table of gates), `.env.example`.

## Acceptance

- `npm ci && npm run check` passes on the empty app: a landing page and an `/app` "Sign in" placeholder.
- One sample unit test, one DB test (the harness boots and `auth.uid()` works per role) and one e2e test (headers present on `/` and `/app/login`).
- Build output has no inline scripts and the gate passes.

Then follow the phase loop in `/xeio-build`.
