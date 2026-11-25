# XeIO Test Report

Updated: 2026-11-25 (Phase 8 Release)

## Quality Gates

| Gate | Command | Status | Count / Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | Pass | 0 errors |
| Lint | `npm run lint` | Pass | 0 problems |
| Unit tests | `npm run test` | Pass | 25 passed (9 files) |
| DB tests (PGlite) | `npm run test:db` | Pass | 17 passed (8 files) |
| Build + Release Gate | `npm run build` | Pass | `postbuild-check.mjs` passed (CSP, headers, no secrets/sourcemaps, <25 MiB, robots/sitemap) |
| E2E (Playwright) | `npm run test:e2e` | Pass | 27 passed (8 files, includes axe a11y on `/` & `/app/login` + MediaPipe WASM CSP) |
| Screen checks | `npx playwright test --config=scripts/screens/playwright.config.mjs` | Pass | 29 passed (`G1`, `G2`, `A1`–`A5`, `F-list`, `F1`–`F8`, `F9a`, `S1`, `S2`, `S4`, `S5`, `S8`, `S9`, `H1`–`H4`, `O1`, `O3`) |
| Audit | `npm run audit` | Pass | 0 vulnerabilities (moderate+) |
| Edge functions | `deno check` / `deno lint` | Gap | `deno` CLI not installed in local environment |
| Staging load tests | `k6 run loadtest/*.js` | Gap | Scripts ready (`signin.js`, `submit.js`, `live-poll.js`); requires live staging Supabase + Judge0 |
| Live header scan | `securityheaders.com` / Observatory | Gap | Requires deployed staging URL |

## What the DB Tests (`tests/db`, 17 tests) Prove

- **Sign-up gate & roles:** No self-signup without matching invite and institutional domain; role assigned from invite; deactivated users blocked.
- **Admin & AI credits:** `admin_invite` and subscription decisions restricted to `super_admin`; Pro (125/5) & Elite (250/7) caps enforced and invalid drafts refunded; `audit_log` append-only and institution-scoped.
- **Course plan & roster:** Rubric must total 50; COs + CO–PO map required before send; HOD approval scoped to department; 126-student roster splits 63/63; `join_with_code` validated server-side.
- **Lab prep & secret isolation:** Session activates only with 2 valid questions and non-overlapping 15/15/15 pre/post banks; students cannot read hidden tests, bank answers, reference solutions, or `authorize_run`.
- **Lab run & scoring:** Pre-test draws 2E+2M+1H and closes on attendance start; post-test unlocks only after all hidden tests pass; viva capped by rubric; hints scoped to batch; drafts/submissions isolated per student.
- **Classroom, reports & marks pipeline:** `class_answer_keys` hidden from students and scored server-side; `final_status` pipeline enforced (`Faculty -> HOD -> CoE`); notifications & calendar token rotation verified.
- **Oversight scoping:** `course_stats`, `at_risk_students`, and `live_lab_stats` enforce department (HOD) and school (Dean) isolation.
- **End-sem 6-stage state machine & proctoring:** Mix must total 40; exactly 30 approved with >= 4 per CO; HOD approval required before scheduling; attendance required before activation; absent students refused `start_exam`; extra time updates deadline; 3 warnings flag paper without terminating; `add_assessment_to_file` refused until flagged events are reviewed.

## Load Test Targets (`loadtest/`)

- `loadtest/signin.js`: 500 sign-ins over 5 min (target p95 < 2s, error rate < 1%).
- `loadtest/submit.js`: 500 submits in 60s against `run-code` (target p95 < 10s, error rate < 1%).
- `loadtest/live-poll.js`: 500 concurrent VUs polling live lab (target error rate < 1%).
