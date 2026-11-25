---
name: xeio-release-gate
description: Run every XeIO quality gate (types, lint, unit, DB, edge functions, build with release check, e2e, screen checks, audit) and report results. Use before calling any phase or feature done.
---

# /xeio-release-gate

Run the following in order. Stop at the first failure, fix it and rerun from the start.

```bash
npm run typecheck
npm run lint
npx vitest run tests/unit
npx vitest run tests/db
(cd supabase/functions && deno check */index.ts && deno lint)
npm run build            # includes scripts/postbuild-check.mjs
npx playwright test tests/e2e
npx playwright test -c scripts/screens/pw.config.ts
npm audit
```

The build and e2e runs need these env vars (use placeholders; never real keys):

```
VITE_SITE_URL=https://xeio.example.in
VITE_SUPABASE_URL=https://e2e.supabase.co
VITE_SUPABASE_ANON_KEY=e2e-anon
VITE_ALLOWED_DOMAINS=sanjivani.edu.in
```

## Report (paste into the walkthrough and update TEST-REPORT.md)

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass, 0 problems |
| Unit | `vitest tests/unit` | N passed |
| Database (real migrations + RLS) | `vitest tests/db` | N passed |
| Edge functions | `deno check`, `deno lint` | Pass |
| Build + release check | `npm run build` | Pass, N files checked |
| End-to-end | `playwright tests/e2e` | N passed |
| Screens | `playwright -c scripts/screens` | N screens, 0 page errors |
| Dependencies | `npm audit` | 0 vulnerabilities |

## Rules

- Do not mark the phase done unless every row passes.
- A test that cannot run (missing tool, no network) is a failure. Say what is missing.
- Never delete or skip a test to get a pass.
