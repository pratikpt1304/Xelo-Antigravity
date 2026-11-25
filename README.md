# XeIO

AI faculty assistant LMS that plans, runs, and reports programming labs from course setup to the NBA/NAAC course file. Built by **Elzeo Future Technologies Pvt Ltd, India**.

## Stack

- **Frontend:** Vite, React 19, TypeScript (strict), React Router v7 (`/` static landing + `/app` SPA), CodeMirror 6, self-hosted IBM Plex fonts, MediaPipe Tasks Vision (self-hosted WASM), `pdfjs-dist`, `qrcode-generator`.
- **Backend:** Supabase (Postgres with RLS + PL/pgSQL workflow functions, Auth OAuth/OTP, Storage, Realtime, Deno Edge Functions).
- **Code Execution & AI:** Judge0 and LLM JSON API called exclusively from Supabase Edge Functions.
- **Hosting:** Cloudflare Pages (`public/_headers`, `public/_redirects`).

## Repository Map

```text
src/            React landing page & /app SPA (admin, oversight, hod, faculty, student)
supabase/       migrations (0001..0009), seed.sql, Deno edge functions & _shared/
tests/          unit (Vitest), db (PGlite + RLS stand-in), e2e (Playwright)
scripts/        postbuild-check.mjs release gate, copy-vendor.mjs, screen captures
loadtest/       k6 load test scripts for staging (signin, submit, live-poll)
public/         _headers, _redirects, robots.txt, sitemap.xml, vendored assets
docs/           PRD, UI references, screen checklist, architectural decisions
```

## Running Locally

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy `.env.example` to `.env` and fill in your local/staging Supabase URL and anon key.
3. Start local Supabase (optional, for full stack):
   ```bash
   supabase start
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## Test & Quality Gates

- `npm run typecheck` — TypeScript strict check
- `npm run lint` — ESLint (`typescript-eslint`, `react-hooks`, `security`)
- `npm run test` — Vitest unit tests (`tests/unit`)
- `npm run test:db` — PGlite Postgres migration & RLS tests (`tests/db`)
- `npm run build` — Vendor copy, `tsc`, Vite build, and `scripts/postbuild-check.mjs` release gate
- `npm run test:e2e` — Playwright E2E + axe accessibility checks (`tests/e2e`)
- `npm run audit` — `npm audit --audit-level=moderate`
- `npm run check` — Runs all gates above in sequence
