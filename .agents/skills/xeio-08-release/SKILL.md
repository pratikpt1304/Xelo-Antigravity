---
name: xeio-08-release
description: Phase 8 of the XeIO build. Load test, security review, final docs, Supabase and Cloudflare Pages deployment steps, and the release package. Use after phase 7 is approved, and before any production deploy.
---

# Phase 8: Release

## 1. Full parity sweep

Run `/xeio-parity-check` for **every** ID in `docs/screens.md`. Fix all differences, or record each accepted difference in `docs/decisions.md`.

## 2. Load test (PRD §12 NFRs)

- Write k6 (or Artillery) scripts in `loadtest/` against a staging Supabase project and a Judge0 instance:
  - 500 sign-ins in 5 minutes.
  - 500 submits in 60 s.
  - 500 concurrent students polling a live lab.
- Targets: run/submit p95 < 10 s; sign-in p95 < 2 s; error rate < 1%.
- Record the results in TEST-REPORT. If a target is missed, report it with the bottleneck and the fix (pooler size, Judge0 workers, rate limits). Do not hide it.

## 3. Security review

- Walk rule 04 item by item and mark each Pass or Fix with evidence.
- Run the app's headers through securityheaders.com and Mozilla Observatory on staging, and record the grades.
- `npm audit`: 0 issues. Edge function imports pinned.
- Make sure there are no secrets in git history, `dist/` or the edge function logs.
- Write SECURITY.md: threat model, controls, data retention, DPDP notes, an incident contact, and the CERT-In 6-hour reporting reminder.

## 4. Docs

- **README:** what XeIO is, the stack, the repo map, running locally (`supabase start`, `npm run dev`) and all test commands.
- **DEPLOY**, step by step:
  1. Supabase project in an India region, Pro plan, pooler on.
  2. Apply the migrations in order (`supabase db push`).
  3. Auth providers (Google, Azure), redirect URLs and email templates.
  4. Storage buckets (`class-files`, `proctor`).
  5. Realtime for `notifications` and `submissions`.
  6. Edge functions: `supabase functions deploy run-code validate-question ai-generate send-invites`, then `supabase functions deploy calendar --no-verify-jwt`.
  7. Secrets: `ALLOWED_ORIGINS`, `SITE_URL`, `JUDGE0_URL`, `JUDGE0_KEY`, `JUDGE0_KEY_HEADER`, `ANTHROPIC_API_KEY` (or the chosen provider), `AI_MODEL`.
  8. Judge0 (cloud or self-hosted, with cgroup v1 noted).
  9. Cloudflare Pages: build command `npm run build`, output `dist`, and env vars `VITE_SITE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ALLOWED_DOMAINS`.
  10. Custom domain.
  11. First super admin (seed SQL).
  12. Pre-exam checklist: a real-webcam face check and a Safe Exam Browser configuration.
- **TEST-REPORT:** a table of every gate with command and result, what the DB tests prove (bullets per rule), and the load test results.

## 5. Package

- `npm run check` green from a clean clone (`git clean -xfd && npm ci && npm run check`).
- Tag `v1.0.0`.
- Produce `XeIO-v1.0.0.zip` excluding `node_modules`, `dist`, `public/vendor`, `public/models` and `.env*`.
- Verify the zip builds after `npm ci`.

## 6. Walkthrough

- Final screenshots of every board next to the canvas.
- Every test count.
- Load test numbers.
- Open risks.
- The exact deploy order.
