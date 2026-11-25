---
trigger: always_on
description: Security and privacy baseline for XeIO (OWASP Top 10 2025, ASVS L2 intent, DPDP Act). Applies to every task.
---

# Security rules

## Access control (A01)

- Enable RLS on every table. Default deny. Policies use the helper functions, never client-supplied ids alone.
- Students can never read:
  - hidden test cases
  - bank answers
  - class answer keys
  - other students' rows
  - reference solutions
- Only the `service_role` can read hidden tests, through a function (e.g. `authorize_run`) that also checks the caller may run that question in that context.
- Every workflow function checks role, scope and state before acting.
- Write a database test for each "cannot" in the PRD's role table.
- Approvals and audit rows are visible only within the same institution (super admin excepted).

## Authentication (A07)

- No password fields.
- Domain allow-list on the client (`VITE_ALLOWED_DOMAINS`) and enforced again in the sign-up gate trigger.
- Sessions:
  - Students expire after 12 h.
  - Staff time out after 8 h idle.
  - Refresh never logs a user out during a lab or exam.

## Injection and XSS (A05)

- Use parameterised queries only.
- Never use `dangerouslySetInnerHTML` with data. Render problem statements and code as text.
- Judge0 receives code base64-encoded.
- Never build shell commands from input.

## Supply chain (A03)

- Lock dependencies (`package-lock.json`). `npm audit` must report 0 moderate or higher.
- Pin edge function imports to exact versions (`npm:@supabase/supabase-js@x.y.z`).
- Self-host fonts, the MediaPipe wasm and the face model.

## Headers (`public/_headers`, Cloudflare Pages)

Applied to every path:
- HSTS (`max-age=31536000; includeSubDomains`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY`

CSP is set **per path**, never on `/*`, because Cloudflare would merge the policies:
- **Landing:** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`.
- **App (`/app/*`):** adds `'wasm-unsafe-eval'` for MediaPipe, `style-src 'self' 'unsafe-inline'`, `connect-src` to the Supabase URL (https and wss), `media-src 'self' blob:` and `worker-src 'self' blob:`.
- **Permissions-Policy:** camera, microphone and display-capture are allowed only on `/app/*`; geolocation and payment are denied everywhere.

## Edge functions

- Allowlist CORS origins. POST only. 200 KB body cap. Validate input with zod.
- Verify the JWT and use a user-scoped client for every user action. Use the admin client only for narrowly scoped service reads.
- Rate-limit run and submit per user (e.g. 20 per minute).
- Never return hidden test inputs or outputs. For hidden tests, return only pass/fail counts.

## Errors and logging (A09, A10)

- Show the user only mapped messages from `errors.ts`. Never show stack traces, SQL or internals.
- Write `audit_log` (append-only) for:
  - sign-up
  - approvals and returns
  - mark inputs (attendance, viva)
  - exam events
  - admin actions
  - plan changes
- Fail closed. A missing check denies.

## Exam integrity

- The exam clock lives on the server (paper `deadline`).
- Exam rules:
  - Only students marked present can start.
  - Late students get only the remaining time.
  - Unsubmitted work autosubmits at time-out.
- Proctor events: tab switch, fullscreen exit, no face, multiple faces, copy or paste, devtools, disconnect, camera off.
  - Store them with timestamps.
  - Three warnings flag the attempt for review; they never end the exam.
  - Flags never change marks by themselves.
  - All flags must be reviewed before results go to the course file.
- Do not record continuous video. Store event snapshots only, kept 90 days.

## Privacy (DPDP Act 2023)

- Collect the minimum data. Use an India region for Supabase. Keep a retention note in SECURITY.md.
- Log every staff read of student data in bulk views.

## Release gate (`scripts/postbuild-check.mjs` runs after every build and fails the build)

The build fails on any of these:
- a secret pattern in `dist/` (service keys, `sk-`, private keys)
- source maps in `dist/`
- any file over 25 MiB
- inline scripts in HTML
- missing headers or CSP
- a missing sitemap or robots.txt
