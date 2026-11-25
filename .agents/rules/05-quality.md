---
trigger: always_on
description: Definition of done, testing and the way the agent works and reports for XeIO.
---

# Definition of done (every phase, every feature)

A feature is done only when all of these hold. Report each one in the walkthrough, with the command output.

1. `npm run typecheck`: 0 errors.
2. `npm run lint`: 0 problems.
3. **Unit tests** (`vitest`, `tests/unit`): every pure function in `src/lib/logic` has tests, including edge cases (empty class, absent students, a rubric that does not total 50, a batch of 126, ties).
4. **Database tests** (`tests/db`) run the real migrations on PGlite with a Supabase stand-in:
   - The stand-in provides the roles `anon`, `authenticated` and `service_role`, `auth.users`, and `auth.uid()` read from `request.jwt.claim.sub`.
   - Test every workflow function: the happy path, every refusal code, and every "cannot" for each role.
   - RLS: a student cannot read another student's rows, hidden tests or answer keys; a user cannot read another institution's data.
5. **Edge functions:** `deno check` and `deno lint` pass. Shared helpers (judge, AI-output validation, ICS) have unit tests.
6. **End-to-end** (Playwright with Chrome, `tests/e2e`):
   - Run against a local static server that applies `_headers` and `_redirects`. Mock Supabase with `page.route`. Seed a fake session in localStorage.
   - Cover role routing for all seven roles, deep links, a refused student on staff routes, a not-onboarded email, a deactivated account, the face detector loading under the app CSP, and not-found pages.
   - Run axe on the landing and sign-in pages: no serious or critical violations.
7. **Screen checks** (`scripts/screens`): every screen in `docs/screens.md` for the phase renders with sample data, with no `pageerror`, and is screenshotted. Compare each screenshot with the canvas board and fix differences in layout, labels or missing elements.
8. `npm run build`: passes, including the release gate.
9. `npm audit`: 0 vulnerabilities at moderate or above.
10. Docs updated: README, DEPLOY, SECURITY, TEST-REPORT (counts and dates) and `docs/decisions.md` for new decisions.

Never mark a task done with failing or skipped tests. Never weaken a test to make it pass; fix the code. If a test needs an external service (Judge0, the AI provider, SSO), mock it and say so.

# How to work

- **Plan first.** For each phase, write an implementation plan artifact: files, migrations, functions, screens and tests. Wait for approval before writing code.
- **Small, ordered tasks.** Schema → access rules → workflow functions and their DB tests → edge functions → UI → e2e and screen checks.
- **Follow the canvas.** Before building a screen, open its board (see `docs/ui/README.md`) and list every visible element and interaction. After building, run `/xeio-parity-check` for that screen.
- **Do not guess on open items.** The PRD §13 open items are resolved in `docs/decisions.md`. Anything else unclear: ask one short question and keep working on what is not blocked.
- **No silent scope changes.** If something in the PRD cannot be done as written, say so in the walkthrough with the reason and the alternative you used.
- **Walkthrough at the end of each phase:**
  - what was built
  - screenshots
  - test counts
  - known gaps
  - the exact commands to reproduce
- **Commits:** one per task, conventional style (`feat(faculty): session plan preview`). Never commit secrets or `.env`.

# Performance budget (lightweight LMS)

- Landing page: under 100 KB of JS. App first load: route chunks lazy-loaded, the CodeMirror and PDF chunks loaded only where used.
- No animation libraries. CSS transitions only for state changes (≤ 200 ms), and none under `prefers-reduced-motion`.
- Live views poll at most every 30 s, or use Realtime with debounce.
