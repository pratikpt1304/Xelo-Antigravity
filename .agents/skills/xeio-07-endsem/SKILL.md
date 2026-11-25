---
name: xeio-07-endsem
description: Phase 7 of the XeIO build. End-sem practical as a strict six-stage state machine per batch (rules, generate 40 approve 30, HOD approval, schedule, attendance-gated activation and conduct, marks and attainment), the student secure check and waiting room, the proctored IDE with lockdown and browser face detection, and published results. Use after phase 6 is approved.
---

# Phase 7: End-sem practical and proctoring

**PRD:** §5.8, §6.5, §7 (all), §10 (sections 11–13). **Screens:** F8, E1–E6, S7–S10. **Canvas:** `Faculty.dc.html` Assessments; `Student.dc.html` secure check and proctored IDE.

## Schema and functions

- **Tables:**
  - `assessments`: course, batch, rules jsonb, cos, stage, hod_status, hod_remark, scheduled_at, room, attendance_done, activated_at, ended_at, added_to_file.
  - `assessment_questions`: assessment, question, approved.
  - `exam_papers`: assessment, student, q_ids[2], started_at, deadline, submitted_at.
  - `proctor_events`: paper, type, severity 1–3, detail, at, snapshot_path, reviewed_by, reviewed_at.
  - A department question bank view for the no-repeat check.
- **Functions, one per transition:**
  - `create_assessment(course, batch, rules)`: validates rules — the mix totals 40, ≥ 1 CO, positive marks.
  - Generation happens through `ai-generate` kind `endsem_set` (40 questions; never repeats titles used by other batches or semesters; each validated). Rules lock once generation starts.
  - `send_assessment_to_hod(a)`: exactly 30 approved, ≥ 4 per selected CO, all valid.
  - `decide_assessment(a, approve, remark)`: dept HOD; a decline returns to stage 2.
  - `schedule_assessment(a, at, room)`: only after approval.
  - `save_exam_attendance(a, entries)`, then `activate_assessment(a)`: requires attendance.
  - `start_exam(a)`: student marked present and activated. Draws 2 of the 30 at random (balanced by CO when possible). The deadline is now + duration; late students get only the remaining time.
  - `grant_extra_time(paper, minutes)`.
  - `log_proctor_event(paper, type, detail)`: rate-limited; 3 or more warnings set flagged.
  - `submit_exam(paper)`.
  - `end_assessment(a)`: autosubmits open papers.
  - `review_proctor_event(id)`.
  - `add_assessment_to_file(a)`: requires every flag reviewed.
- **Storage:** a private `proctor` bucket for event snapshots, 90-day retention through a scheduled delete.

## Browser proctoring (`src/lib/proctor-runtime.ts`, policy in `src/lib/logic/proctor.ts`)

- **Secure check:**
  - `getUserMedia` (camera + mic).
  - `getDisplayMedia` with the entire screen required (check `displaySurface === 'monitor'`).
  - Single monitor (`screen.isExtended === false` when available).
  - Fullscreen request.
  - Face detector loaded.
- **Face detection:**
  - MediaPipe FaceDetector (blaze_face_short_range with NormalizationOptions metadata), wasm self-hosted, every 2 s.
  - No face for 10 s or more than 1 face triggers an event.
- **Lockdown:**
  - Fullscreen exit, visibility or blur, copy, paste and cut, contextmenu, devtools shortcuts and drop are blocked or logged.
  - A warning toast; the 3rd warning flags the attempt.
  - Never auto-terminate.
- **Resilience:**
  - Autosave every 10 s.
  - On disconnect, a server-side pause up to 5 min.
  - Resume on any approved machine with the remaining time.
- Stream objects survive the move from the waiting room to the exam (module-level holder).

## UI

- **Faculty F8:** a stepper with locked stages greyed (E1–E6 as `docs/screens.md`), with the live proctor panel polling every 5 s.
- **Student:** S7 (before the day, with eligibility from attendance vs the institution minimum), S8 (secure check and waiting room; polls every 5 s for "present" and "activated"), S9 (proctored IDE, no navigation, proctor bar) and S10 (results only when the course final status is hod_approved or coe_accepted and the assessment is added to the file).

## Tests

- **DB:**
  - Rules validated; exactly 30 with ≥ 4 per CO.
  - The set is locked while with the HOD.
  - No scheduling before approval.
  - Attendance required before activation; only present students start.
  - Each student gets their own 2 questions.
  - Extra time works.
  - Flags must be reviewed before adding to the file.
  - Absent students are marked absent, not zero.
- **Unit:** rules errors, paper marks (25 per question, 60 total), the warning policy.
- **E2E:** the face detector loads under the app CSP and detects on a test frame (a canvas with a face image from the test fixtures, licence-safe); the waiting room blocks start until activated (mocked).
- **Screens:** F8 at each stage, S7, S8, S9 and S10.
