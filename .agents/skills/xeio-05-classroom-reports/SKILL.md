---
name: xeio-05-classroom-reports
description: Phase 5 of the XeIO build. Classroom timeline with Assist tasks and file resources, reports (course file, internal attainment, student lab files, final marks submission), the student classroom, the printable lab file with QR verification, notifications and the personal calendar feed. Use after phase 4 is approved.
---

# Phase 5: Classroom, reports and notifications

**PRD:** §5.7, §5.9, §6.2, §6.4, §10. **Screens:** F7, F9, F9a–F9d, S2, S5, S6, G4, G5. **Canvas:** `Faculty.dc.html` steps 7 and 9; `Student.dc.html` classroom and lab file.

## Schema and functions

- **Classroom:**
  - `class_items`: course, week 1–30, kind task/resource/announcement, task_type, title, body, payload, due_at, url (https only), file_path, created_by.
  - `class_answer_keys` (faculty only).
  - `class_responses`.
  - `submit_class_response(item, answer)` scores server-side from the key.
- **Storage:** a private bucket `class-files` (20 MB), paths `<course_id>/<timestamp>-<safe name>`. Insert by course faculty; read by `can_read_course`. Students get signed URLs (300 s).
- **Reports:**
  - `course_notes` (BoS suggestions, summaries).
  - `course_snapshots` (students, internal_mean, below_40, co_internal, co_overall, overall_pct, computed_at), written by the faculty when the report is computed. It is a summary for dashboards; marks are always recomputed from rows.
- **Final marks:** `submit_final_marks(course)`, `decide_final_marks(course, approve, remark)` (HOD, then CoE), each writing approvals and audit.
- **Notifications:**
  - `notifications` table: user, kind, title, body, link (must start with `/`), created_at, read_at.
  - Users can read and update read_at on their own only.
  - `notify()` is service-only.
  - Triggers: plan sent → HOD; plan decided → faculty; final marks submitted → HOD; HOD-approved → CoE and faculty; returned or accepted → faculty; end-sem set sent → HOD; decided → faculty; scheduled → batch students. Hints come from phase 4.
- **Calendar:**
  - `profiles.calendar_token` (uuid) and `rotate_calendar_token()`.
  - `calendar_events(token)`, service_role only: the user's sessions and exams by role.
  - Edge function `calendar` (GET `?t=`) returns `text/calendar` built by `_shared/ics.ts` (RFC 5545 line folding, IST all-day events). Deploy with `--no-verify-jwt`.

## Pure logic

- `api/report.ts`: `loadCourseData` (paged fetches) and `computeReport(data)` → rows (per-session marks, internal, attendance, CO %, end-sem), conducted sessions, coInternal, coEndsem, coOverall.
- `attainment.ts`: `coAttainment`, `level`, `overall`, `poAttainment`.
- `stats.ts`: mean, sd, histogram, normal pdf, learners (bottom 10% or under 40 = slow; top 10% = fast).
- `toCsv` with quoting; the download adds a UTF-8 BOM.

## UI

- **F7:** as `docs/screens.md`. `ai-generate` kind `class_task` returns a draft only; it is inserted on "Add to this week" (item + answer key). `announcement` returns text only.
- **F9a–F9d:** as `docs/screens.md`. Print uses `@media print`. The 14 course-file sections follow PRD §10 with statuses; the footer credits Elzeo.
- **S2:** as `docs/screens.md`.
- **S5 lab file:** as `docs/screens.md`, using the canvas declaration wording with the student's name, roll and course; IBM Plex Serif on the title page; QR to the verify URL.
- **S6 verify:** a public route under `/app/verify/:course/:student`. It reads through a definer function that returns only name, roll, course, internal and attendance.
- **G4 bell:** in the faculty top bar, console shells and the student header. Realtime insert subscription; mark all read; Esc and outside-click close it. Header button styles must not leak into the dropdown (pitfall 11).
- **G5 calendar link:** a component with copy and reset.

## Tests

- **DB:**
  - Notifications go to the right people; nobody can read or forge another user's.
  - Class answer keys are hidden from students.
  - Class files can be read only by course members.
  - The calendar works only with a valid token, and reset stops the old link.
  - The final marks pipeline: faculty → HOD → CoE with remarks to return.
- **Unit:** computeReport (absent, late, partial sessions, end-sem merge), attainment levels and weights, learners, CSV quoting, ICS folding.
- **Screens:** F7, F9a, F9b, F9c, S2, S5 (all four pages), bell open.
