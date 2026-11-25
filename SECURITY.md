# XeIO Security Policy & Controls

Designed and maintained by **Elzeo Future Technologies Pvt Ltd, India**.

## Threat Model & Access Control (OWASP A01 / A07)

- **Default-deny Row Level Security (RLS):** Enabled on every table in `supabase/migrations/`. Policies rely exclusively on `security definer` helper functions (`me()`, `my_role()`, `my_institution()`, `is_super_admin()`, `is_course_faculty()`, `is_course_student()`, `can_oversee_course()`, `can_read_course()`). `FORCE ROW LEVEL SECURITY` is intentionally avoided to prevent recursive definer evaluation.
- **Role & Scope Enforcement:** Workflow transitions (`security definer` PL/pgSQL functions) verify caller role, institutional/department/school scope, and state machine preconditions before mutating rows, writing an immutable `audit_log` entry on every transition.
- **Secret Isolation:** Students cannot query hidden `test_cases`, `reference_solutions`, `bank_items` answers, `class_answer_keys`, or other students' rows. Only `service_role` reads hidden tests via `authorize_run` inside Edge Functions.
- **Sign-up Gate:** No self-signup (`shouldCreateUser: false`). A `before insert` trigger on `auth.users` enforces a matching active invite and institutional email domain.
- **Session Policies:** Students expire after 12h; staff time out after 8h idle.

## Injection, XSS & Supply Chain (OWASP A03 / A05)

- **No `dangerouslySetInnerHTML`:** Problem statements, code, and user text render as plain text.
- **Base64 Judge0 Payloads:** Source code is base64-encoded before submission to Judge0 from `run-code` / `validate-question`.
- **Pinned Dependencies:** `package-lock.json` is committed and `npm audit --audit-level=moderate` must report 0 vulnerabilities. Deno Edge Function imports are pinned to exact versions (`npm:zod@3.24.2`, `npm:@supabase/supabase-js@...`).
- **Self-hosted Assets:** IBM Plex fonts and MediaPipe Vision WASM (`/vendor/mediapipe`) are self-hosted; no external runtime CDNs.

## Headers & Release Gate (`public/_headers`, `scripts/postbuild-check.mjs`)

- HSTS (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: DENY`.
- Path-scoped CSP: `/` (strict `default-src 'self'`, no inline scripts/styles) and `/app/*` (adds `'wasm-unsafe-eval'` for MediaPipe, Supabase `https`/`wss` `connect-src`, and `blob:` media/worker).
- `Permissions-Policy`: camera/microphone/display-capture allowed only under `/app/*`; geolocation and payment denied everywhere.
- `scripts/postbuild-check.mjs` fails the build on secret patterns in `dist/`, source maps, files > 25 MiB, inline HTML `<script>`, or missing `_headers` / `robots.txt` / `sitemap.xml`.

## Exam Integrity & Privacy (DPDP Act 2023)

- **Server Clock:** Exam deadlines live on `exam_papers.deadline` in Postgres; unsubmitted papers auto-submit on timeout or `end_assessment`.
- **Proctoring:** Client lockdown (`visibilitychange`, `fullscreenchange`, clipboard, devtools, offline) and browser MediaPipe face checks log timestamped `proctor_events`. Three warnings flag the paper for faculty review without auto-terminating or altering marks.
- **Data Retention:** Continuous video is never recorded. Only event-triggered JPEG snapshots are uploaded to the private `proctor` bucket and retained for **90 days**.
- **DPDP Act 2023:** Production Supabase must run in an **India region** (`ap-south-1`). Minimal PII is collected (name, institutional email, roll number), and bulk staff reads are audited.

## Incident Response & CERT-In

- **Incident Contact:** `security@elzeo.in`
- **CERT-In Reporting:** Any reportable cybersecurity incident must be reported to CERT-In within **6 hours** of noticing/being notified of the incident, per CERT-In Directions (28 April 2022).
