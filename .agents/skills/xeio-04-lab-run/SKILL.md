---
name: xeio-04-lab-run
description: Phase 4 of the XeIO build. Running a lab end to end - lab check-in, attendance suggested from check-ins, pre/post tests, the full-screen student IDE with run/submit and autosave, the faculty live monitor with alerts, hints, TA and slow-learner actions, viva, student inspector, preview as student, and the student home. Use after phase 3 is approved.
---

# Phase 4: Run a lab

**PRD:** §5.6, §6.1, §6.3, §5.5 (test rules). **Screens:** F6, F6a–F6f, F6p, S0, S1, S3, S4. **Canvas:** `Faculty.dc.html` step 6 and inspector; `Student.dc.html` home and IDE.

## Schema and functions

- **Tables:**
  - `session_runs`: session, batch, started_at, ended_at, attendance_done, post_close, remark; unique (session, batch).
  - `attendance`: session_run or assessment, student, state present/late/absent, marked_by, at.
  - `test_attempts`: session, student, bank, item_ids, answers, score, started_at, submitted_at; unique per bank.
  - `submissions`: student, question, context, run or paper, mode, lang, code ≤ 50k, visible/hidden passed/total, marks, verdict, runtime_ms.
  - `drafts`: student, question, context, lang, code, updated_at.
  - `viva`: student, session or assessment, marks, examiner.
  - `lab_checkins`: session, student, first_at, last_at.
  - `course_flags`: course, student, kind slow/fast, note, created_by.
- **Functions:**
  - `start_session_run(session, batch)`: idempotent; does not set started_at.
  - `save_attendance(run, entries)`: only batch students; sets attendance_done and started_at, closes the pre-test and marks the session conducted.
  - `lab_checkin(session)`: student enrolled.
  - `suggest_attendance(run)`: present if checked in within 3 h, else absent.
  - `start_test(session, bank)`: draws 2E/2M/1H for pre (only before the run starts) or 1E/2M/2H for post (only if `hidden_all_passed`, until 23:59 IST); returns items without answers.
  - `submit_test(attempt, answers)`: scores server-side; one attempt.
  - `end_session_run(run, remark)`.
  - `set_viva(student, session, assessment, marks)`: capped by the rubric; refused for absent students.
  - `send_hint(run, students[], text)`: inserts student notifications (kind `hint`, link to the lab); add the notifications table now if phase 5 has not.
  - `live_lab_stats` comes in phase 6; the faculty live view queries directly.
- Add `submissions` and `notifications` to the Realtime publication.

## Pure logic

- `rubric.ts`: `sessionMarks({attendance, preCorrect, postCorrect, questions, viva}, rubric)`, `internalOutOf100`, `attendancePct`.
- `flows.ts`:
  - `preTestAnalytics(attempts, items)`: distribution 0–5, % per level, insight; must tolerate missing `item_ids`.
  - `monitorAlerts(students, subs, lastDraft, absent, now)`: struggling = ≥ 4 runs with nothing passing; idle = 15 min.
  - `weekOf`.
- `starters.ts`: starter code per language; file names `main.c`, `main.cpp`, `Main.java`, `main.py`, `main.rs`, `main.go`.

## UI

- **Faculty F6:** follow `docs/screens.md`, F6–F6f.
  - Render the session panel only after the runs list has loaded (pitfall 6).
  - The attendance modal opens first when the run is not done.
  - Realtime updates are debounced at 1.5 s, with a 60 s poll for idle detection.
- **F6p Preview:** the Workbench component in preview mode: Run and Save disabled, sample data shown, read-only banner.
- **Workbench** (shared by lab, preview and exam):
  - The 44 px top bar, the 25%/75% layout and the console as in rule 03.
  - CodeMirror with line numbers, highlighting, bracket matching and auto-indent; the keyboard can leave the editor (Esc then Tab).
  - Autosave to `drafts` every 10 s and on Run; restore on refresh (question, language, code).
  - The status dot per question: grey, orange (visible passed), teal (all passed).
- **Student S0, S1, S3, S4:**
  - The lab page calls `lab_checkin` on open and shows the latest hint live.
  - The post-test card unlocks when both questions pass all hidden tests.

## Tests

- **DB:**
  - Pre-test: one attempt, 2/2/1, closes when attendance starts.
  - Post-test unlocks only after all hidden tests pass and closes at 23:59.
  - Attendance accepts only batch students.
  - Viva is capped by the rubric.
  - Check-in leads to a present suggestion.
  - Hints reach only the chosen students in that batch.
  - A student cannot read others' submissions or drafts.
- **Unit:** rubric marks (absent = 0, late = half attendance), internal /100, analytics, alerts.
- **E2E:**
  - A student opens the lab: IDE regions present; Run shows visible verdicts; hidden inputs never in network responses (mocked).
  - Refresh restores the code.
  - The faculty deep link to sessions works.
- **Screens:** F6 with the attendance modal, F6 live, the inspector, S1 and S4.
