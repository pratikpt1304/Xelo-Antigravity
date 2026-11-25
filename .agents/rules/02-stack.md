---
trigger: always_on
description: XeIO stack, architecture and code conventions. Overrides PRD section 12 where they differ.
---

# Stack and architecture

The PRD's reference stack (Firebase, Node API) is replaced by this stack. The API groups in PRD §12 map to database functions and edge functions as described below.

## Stack (pin exact versions in package.json; `npm ci` must work)

- **Frontend:** Vite + React 19 + TypeScript (strict), react-router-dom v7 with `createBrowserRouter`.
  - Two entry points: `index.html` is the static landing page; `app/index.html` is the SPA with basename `/app`.
  - Each role portal is a lazy chunk.
- **Editor:** CodeMirror 6 with C, C++, Java, Python, Rust and Go language packages.
- **Fonts:** `@fontsource/ibm-plex-sans`, `ibm-plex-mono` and `ibm-plex-serif`, self-hosted. No Google Fonts at runtime.
- **Backend:** Supabase.
  - Postgres with row-level security on every table.
  - Auth: OAuth (Google, Azure) plus email one-time links with `shouldCreateUser: false`.
  - Realtime, Storage, and Edge Functions (Deno).
- **Code execution:** Judge0 (self-hosted or the cloud API), called only from edge functions.
- **AI:** an LLM API with JSON outputs, called only from edge functions. Every output is validated before it is stored as a draft.
- **Proctor vision:** MediaPipe Tasks Vision FaceDetector, running in the browser. Self-host the wasm files and the model under `/vendor` and `/models`; do not use a CDN.
- **PDF reading** (syllabus upload): pdfjs-dist, lazy-loaded.
- **QR codes:** qrcode-generator.
- **Hosting:** Cloudflare Pages, using `public/_headers` and `public/_redirects` (`/app/* /app/index.html 200`).

## Where logic lives

- **Database (migrations in `supabase/migrations/NNNN_name.sql`, in order):**
  - Tables with RLS and helper functions: `me()`, `my_role()`, `my_institution()`, `is_super_admin()`, `is_course_faculty(c)`, `is_course_student(c)`, `can_oversee_course(c)`, `can_read_course(c)`.
  - Helpers are `security definer`, `stable`, with `search_path = public`.
  - Every workflow transition is a `security definer` plpgsql function. It checks role and scope first, then state, then performs the change, writes `audit_log` and raises a short code such as `forbidden`, `not_pending`, `remark_required` or `rubric_must_total_50`.
  - **Do not use FORCE ROW LEVEL SECURITY.** It makes definer helpers recurse.
  - Column guards are `before update` triggers, one per table, keyed on `is_api_user()` (`current_user in ('authenticated','anon')`). They stop direct edits of protected columns (status fields, approvals, marks inputs).
  - The sign-up gate is a trigger on `auth.users` insert. It requires a matching invite and email domain, creates the profile from the invite, and enrols invited students.
  - Notifications are inserted only by a service-only `notify()` function, called from triggers or definer functions.
- **Edge functions** (`supabase/functions/<name>/index.ts`, shared code in `_shared/`):
  - `run-code`: run or submit; fetches hidden tests through a service-only RPC.
  - `validate-question`: runs the reference solution in every allowed language.
  - `ai-generate`: kinds `lab_candidates`, `bank`, `endsem_set`, `class_task`, `announcement` and `outcomes`. It charges credits through `consume_ai_credit` and refunds on invalid output.
  - `send-invites`.
  - `calendar`: an ICS feed authorised by a personal token; deployed with `--no-verify-jwt`.
  - Every function has CORS limited to `ALLOWED_ORIGINS`, accepts POST only (except calendar's GET), caps bodies at 200 KB and validates input with zod.
- **Frontend:**
  - `src/lib` holds `supabase.ts` (`rpc`, `fn` and `must` helpers), `session.tsx`, `hooks.ts` (`useLoad` with a stale-request guard, `useAction`), `errors.ts` (error code → plain message) and `types.ts`.
  - `src/lib/logic/` holds pure functions: rubric, attainment, stats, assessment rules, roster split, proctor policy, credits and planning. These have unit tests.

## Secrets

- The browser gets only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` and `VITE_ALLOWED_DOMAINS`.
- The service role key, the Judge0 key and the AI key live only in Supabase function secrets.
- Never commit `.env` files. Provide `.env.example`.

## Conventions

- TypeScript strict. No `any` unless commented.
- ESLint with typescript-eslint, react-hooks and eslint-plugin-security, with 0 problems.
- Use pure functions for any calculation and keep calculations out of components.
- Every list that can exceed 1,000 rows is fetched in pages (`fetchAll` with `.range()`).
- Dates are stored as `timestamptz` and displayed in IST (`en-IN`). Dates-only use ISO `YYYY-MM-DD`.
- No inline `<script>` in HTML. Inline styles are allowed only in the app (CSP allows `style-src 'unsafe-inline'` only under `/app/*`).
- Keep dependencies few. Add one only if it does real work, and record why in `docs/decisions.md`.
