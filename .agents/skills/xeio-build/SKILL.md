---
name: xeio-build
description: Build the XeIO lab LMS from an empty repository, phase by phase, from docs/prd.md and the reference canvas. Use when starting the build or resuming it; it decides which phase runs next.
---

# /xeio-build: run the whole build in order

## Before anything

1. Read `AGENTS.md`, every file in `.agents/rules/`, `docs/decisions.md`, `docs/screens.md` and `docs/ui/README.md`. Read `docs/prd.md` in full once.
2. Open the reference canvas (link in `docs/ui/README.md`) in the browser and screenshot every board and every tab or step inside it. Save the screenshots to `docs/ui/shots/` with board-and-screen names (e.g. `faculty-06-sessions.png`). These are your comparison images for the whole build.
3. Create `docs/progress.md` if missing. It lists every phase below with status (todo, in progress, waiting for approval, done), the date and the test counts. Resume from the first phase that is not done.

## Phases (run in this order; each is its own skill)

| # | Skill | Delivers (IDs from docs/screens.md) |
|---|---|---|
| 0 | `/xeio-00-bootstrap` | Repo, tooling, test harnesses, headers, release gate, tokens, UI kit |
| 1 | `/xeio-01-foundation` | Org model, invites, sign-up gate, sign-in and routing, landing, super admin: G1–G3, A1–A5 |
| 2 | `/xeio-02-course-plan` | Faculty shell, course setup, HOD plan approval, batches, roster, session plan: F0, F-list, F1–F3, H2 (plans) |
| 3 | `/xeio-03-lab-prep` | Judge0 runner, AI service and credits, lab questions, validation, banks, activation: F4, F5 |
| 4 | `/xeio-04-lab-run` | Attendance, live session, tests, full-screen IDE, hints, inspector, student home: F6*, S0, S1, S3, S4 |
| 5 | `/xeio-05-classroom-reports` | Classroom, reports, course file, lab file, verify, notifications, calendar feed: F7, F9*, S2, S5, S6, G4, G5 |
| 6 | `/xeio-06-oversight` | HOD, Dean/CoE/VC consoles and statistics: H0–H5, O0–O4 |
| 7 | `/xeio-07-endsem` | End-sem stages 1–6, secure check, proctoring, results: F8, E1–E6, S7–S10 |
| 8 | `/xeio-08-release` | Load test, security review, docs, Cloudflare and Supabase deploy, release package |

## Loop for every phase

1. Run the phase skill. It starts with a plan artifact; wait for approval of the plan.
2. Implement in the order the phase skill gives.
3. Run `/xeio-parity-check` for every screen ID in the phase.
4. Run `/xeio-release-gate`.
5. Write the walkthrough artifact: what was built, screenshots next to the canvas screenshots, test counts, gaps and the commands to reproduce.
6. Update `docs/progress.md` to "waiting for approval" and **stop**. Do not start the next phase until the user approves.

## Never

- Never skip a phase or merge phases to save time.
- Never mark a phase done with a failing gate.
- Never change a number, role or flow from the PRD without writing it in `docs/decisions.md` and saying so in the walkthrough.
