# Decisions for the build

These override or settle the PRD where noted. Add a dated line here for every new decision you make during the build.

## Stack and hosting (overrides PRD §12)

| PRD reference | Build decision | Why |
|---|---|---|
| Firebase Hosting / CDN | **Cloudflare Pages** (static, `_headers`, `_redirects`) | Owner's hosting choice |
| Node API (NestJS/Fastify) on Cloud Run | **Supabase:** Postgres RLS + security-definer functions for workflows; Deno Edge Functions for code runs, AI, invites and the calendar | One backend; every rule enforced in the database; no always-on API servers to scale |
| Redis/BullMQ queue | Judge0's own queue, plus per-user rate limits in `run-code` | Enough for the pilot (500 concurrent); revisit if p95 exceeds 10 s in the load test |
| Monaco or CodeMirror | **CodeMirror 6** | Smaller bundle; meets every IDE requirement |
| Next.js or Vite | **Vite** multi-page (landing + `/app` SPA) | Static output for Cloudflare Pages |
| LLM API | Provider adapter in `supabase/functions/_shared/llm.ts`; default Anthropic Messages API (`ANTHROPIC_API_KEY`, `AI_MODEL`) | Swappable; JSON-only prompts validated by code |

The PRD's API groups map to database functions (`rpc`) and edge functions. The client never writes status or mark columns directly.

## PRD §13 open items, resolved for the build

| Open item | Build decision (change later through settings, not code) |
|---|---|
| Identity provider | Support Google Workspace and Microsoft Entra ID through Supabase OAuth, plus a one-time email link fallback (`shouldCreateUser: false`). One sign-in page for all roles. |
| Face match against profile photo | v1 checks face presence and count every 2 s in the browser (MediaPipe). Photo match is behind a feature flag and off until the university supplies photos and consent wording. |
| Attainment threshold and weights | 60% threshold; levels 60/70/80; internal 40 / end-sem 60. Stored per institution. |
| End-sem on lab machines or laptops | Both. The secure check requires a single monitor, fullscreen, camera and entire-screen share. A Safe Exam Browser configuration is documented for lab machines. |
| Proctor snapshot retention | 90 days, then deleted by a scheduled job. Consent text shown in the waiting room. |
| Course file format | The 14 sections in PRD §10, in that order. |
| Languages per course | All six by default; faculty can restrict them in Course setup. |
| Banks shared across faculty | No, banks are per course. The department question bank stores end-sem sets for the no-repeat check. |
| Number of lab sessions | Default 30 (15 lab periods × 2), as on the canvas. The faculty can change the count in Session plan before saving. |

## Flows the canvas adds beyond the PRD text (build them; they are in `docs/screens.md`)

- **Session plan:** first lab day, last teaching day, lab weekdays, extra holidays and "reserve the last day for makeup". Shows a preview before saving. When dates are short, Assist suggests which adjacent topics to merge. Saving writes one date per session.
- **Course setup:** "Draft from syllabus with Assist" (upload PDF/TXT or paste text) proposes COs with BTL and unit plus a CO–PO map, all editable before insert.
- **Lab questions:** "Assist pick best 2", a bulk pick for N sessions, "Draft candidates for N remaining sessions", "Write own question" and "Upload own" (JSON).
- **Banks:** bulk approve all ready banks, generate all missing banks, MCQ upload from CSV, and a pre/post overlap counter.
- **Sessions:**
  - Attendance is suggested from lab check-ins: opening the lab within 3 h counts as present.
  - Pre-test analytics: a 0–5 histogram, % correct per level and an insight line.
  - Live alerts: struggling = 4+ runs with nothing passing; idle = 15 min.
  - Alert actions: send hint, send a TA to seats (uses batch staff names), add to the slow-learner list.
  - Student inspector timeline.
- **Classroom:** weeks are derived from session dates, with "Jump to this week". Assist task drafts are previewed before "Add to this week". File resources go to private storage with signed URLs.
- **Reports:**
  - CSV downloads (mark list, actual log, internal mark sheet) and CO-selectable distributions with 40, target and 80 markers.
  - Manual slow and fast learner flags.
  - Student lab files tab with "Print all".
  - A course snapshot is stored for the oversight dashboards.
- **Notifications** (bell plus realtime) for:
  - plan, end-sem set and final-marks decisions
  - exam scheduled
  - hints during a lab
- **Personal calendar feed:** an ICS link per user that can be reset.
- **Preview as student:** the faculty opens the lab IDE in read-only preview.

## Pitfalls already learned (do not repeat)

1. `FORCE ROW LEVEL SECURITY` makes definer helpers recurse. Use plain RLS.
2. `INSERT … RETURNING` fails RLS unless the select policy also matches the new row (e.g. `courses_read` must include `faculty_id = auth.uid()`).
3. One generic plpgsql guard trigger that references other tables' columns breaks. Write one guard function per table.
4. The session provider must expose a `restored` flag and wait for `getSession()` before route guards redirect. Otherwise deep links are lost on refresh.
5. `useLoad` must ignore stale responses (a request sequence counter). Otherwise a slow first load overwrites newer data.
6. Render a child that starts a session run only after the runs list has loaded. Otherwise a run is created twice.
7. The MediaPipe face model needs NormalizationOptions metadata (mean/std 127.5). Ship a model file that has it, and test detection in e2e.
8. CSP on `/*` in Cloudflare `_headers` merges with per-path rules. Set CSP per path only.
9. Error codes from the database must stay exact. Do not append text to them, or the friendly message mapping breaks.
10. Approval visibility must be scoped to the same institution. A role-only policy leaks across institutions.
11. A dark header button style must not leak into dropdowns rendered inside the header. Scope it with child selectors.
