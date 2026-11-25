---
name: xeio-02-course-plan
description: Phase 2 of the XeIO build. Faculty workspace shell, course setup with COs, CO-PO and rubric, syllabus drafting, HOD plan approval, batches and roster invites, class codes, and the session plan with calendar preview. Use after phase 1 is approved.
---

# Phase 2: Plan

**PRD:** §5 intro, §5.1–5.3, §8.1 (plan approvals). **Screens:** F0, F-list, F1, F1a, F2, F3, H2 (course plans). **Canvas:** `Faculty.dc.html` steps 1–3, `Hod.dc.html` approvals.

## Schema and functions

- **Tables:**
  - `courses`: institution, department, faculty_id, code, title, ltpc, programme, semester, section, academic_year, plan_status (draft/sent/approved/declined), plan_remark, rubric jsonb, allowed_langs, attainment_target, final_status.
  - `course_outcomes`: code, statement, btl 1–6, unit.
  - `co_po_map`: co, po_code, level 0–3.
  - `batches`: name, class_code (unique, 6 chars without ambiguous letters), slot, room, staff.
  - `enrollments`: batch, student; one batch per course.
  - `pending_enrollments`: batch, email, roll, name.
  - `sessions`: course, n, topic, co, btl, scheduled_date, status none/draft/active/conducted, pre/post windows.
  - `holidays`: institution, day, label.
- **RLS:** faculty manage their own courses (insert allowed for faculty and hod roles). Students read courses they are enrolled in. Overseers read within scope. The courses select policy includes `faculty_id = auth.uid()` (pitfall 2).
- **Guard triggers:** `guard_courses` blocks direct changes to plan_status, final_status and rubric once sent. `guard_batches` and `guard_sessions` block direct status changes.
- **Functions:**
  - `submit_course_plan(course)`: needs at least one CO and a rubric totalling 50; sets status sent; notifies the HOD (notifications arrive in phase 5 — add the trigger then).
  - `decide_course_plan(course, approve, remark)`: dept HOD only; remark required to decline; writes an approval with a content hash of COs + rubric + map.
  - `import_roster(course, rows jsonb)`: domain check, split evenly at ≤ 65 per batch, create batches with codes, pending enrollments and invites.
  - `move_student(student, to_batch)`: only before the first conducted session.
  - `join_with_code(code)`: only if on the roster or invited.
  - `save_session_plan(course, topics text[], dates date[])`: one date per session; owner only; not after sessions are active.
  - `generate_session_plan(course, n)`: fallback.

## Pure logic (unit-tested, `src/lib/logic`)

- `roster.ts`: parse CSV/Excel rows, validate emails and domain, split evenly.
- `flows.ts`:
  - `planDates({start, end, weekdays, holidays, sessions, reserveLast})`
  - `suggestMerge(topics)` (adjacent topics with the shortest combined length)
  - `applyMerge`
- `checks.ts`: `planChecks(rubric, cos, mapped)` returns `[{ok, text}]` ("rubric totals 50", "every CO mapped to a PO", "BTL spread").

## Edge function

`ai-generate` kind `outcomes`: `{course_id, syllabus}` → `{draft: {outcomes: [{code, statement, btl, unit}], map: [{co, po, level}]}}`. Validate the shape and charge 1 run; store nothing (the faculty inserts after editing). Build `_shared/llm.ts` (provider adapter, JSON extraction, retries) and `_shared/ai-schema.ts` now; phase 3 adds more kinds.

## UI

- **F0 workspace shell:**
  - The rail with the nine steps and per-step counts or states. Steps 4–9 are visible but show their lock state until earlier steps are done.
  - Top bar (Ask box with rule-based commands, AI meter, bell placeholder) and the right column (Next best actions computed from course state, Today agenda).
  - Routes `/app/faculty`, `/app/faculty/c/:courseId/:step`.
- **F1 and F1a:** as `docs/screens.md`. Syllabus upload uses lazy pdfjs (`pdfToText`) with a 2 MB limit; paste is also accepted.
- **F2 and F3:** as `docs/screens.md`. The F3 preview is computed client-side with `planDates` and saved with `save_session_plan`.
- **HOD approvals (plans part of H2):** `ConsoleShell` for HOD with the Approvals tab.
  - Each plan shows COs, CO–PO, rubric and Assist checks.
  - Approve, or Decline with a required remark.

## Tests

- **DB:**
  - Rubric must total 50; outcomes required.
  - Only the department HOD decides; a remark is required to decline.
  - The plan locks after sending; an approval row is written.
  - Roster of 126 splits 63/63; wrong domain rejected; students enrolled on first sign-in.
  - `join_with_code` rules; `save_session_plan` is owner only.
- **Unit:** `planDates` (holidays, weekdays, reserve last day, short-by count); `suggestMerge`; roster split; plan checks.
- **E2E/screens:** faculty deep link to `c/:id/setup`; screenshots of F1, F2, F3 and HOD approvals compared to the canvas.

Then run the phase loop steps in `/xeio-build`.
