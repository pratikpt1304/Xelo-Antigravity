---
name: xeio-06-oversight
description: Phase 6 of the XeIO build. HOD console (overview KPIs, Assist suggestions, approval queue with age, courses, live labs, at-risk students, final marks pipeline) and the Dean/CoE/VC console (monitor, courses, internals accept/return, calendar and eligibility), backed by scoped statistics functions. Use after phase 5 is approved.
---

# Phase 6: Oversight consoles

**PRD:** §8.1, §8.2, §3 (scopes). **Screens:** H0–H5, O0–O4. **Canvas:** `Hod.dc.html`, `Oversight.dc.html`.

## Functions (security definer, scoped by `can_read_course` or super admin)

- `course_stats(course ids)` returns course_id, students, sessions_total, sessions_conducted, attendance_pct, completion_pct, at_risk and live_now.
  - Completion = share of (student, conducted session) pairs where both lab questions passed all hidden tests.
  - At risk = attendance below the institution minimum or completion under 50%, once at least 2 sessions are held.
- `at_risk_students(course ids)` returns student, roll, name, course, code, reason and attendance_pct.
- `live_lab_stats(course ids)`: today's runs with course code, batch, room, slot, session n, topic, started/ended, enrolled, present, pre_done, passed and struggling.
- `set_min_attendance(pct)` (CoE/VC); holidays write for CoE/VC.
- Log staff bulk reads of student data in `audit_log`.

## UI

- **HOD:**
  - Rail badges: Approvals = waiting count; Live = labs live now.
  - Overview: KPIs (use the `Kpis` component), "Assist suggests", the approval queue with age (from the HOD's own notification time), and the at-risk table.
  - Approvals for all three types: course plans, end-sem sets and final marks.
    - Sets show Assist checks: CO coverage against the selected COs, difficulty spread, and duplicates against other sets of the course.
    - Final marks show sessions conducted vs planned and whether the end-sem is added.
  - Courses table with stats.
  - Live table refreshed every 30 s, plus exams in progress.
  - Final marks pipeline.
- **Dean/CoE/VC:**
  - Title by role. The Dean is limited to their school.
  - Monitor with KPIs and the departments table; CO attainment comes from `course_snapshots.overall_pct`.
  - Courses with a department filter and an attainment drill-in (read-only, computed live).
  - Internals table (approved by = the HOD approval row, with name and date; mean and below-40 from snapshots).
    - CoE actions: fetch, accept, or return (remark required).
    - Others: view-only.
  - Calendar and eligibility for CoE/VC.

## Tests

- **DB:**
  - Stats are correct on a fixture: 4 students, 1 present-pass, 1 absent, 1 late → attendance 75 and completion 25.
  - Another department's HOD gets no rows; the Dean is limited to their school; nobody sees another institution.
  - Only the CoE accepts internals.
  - `set_min_attendance` is limited to CoE/VC.
- **E2E:** the HOD lands on Overview with badges; the CoE accept flow (mocked).
- **Screens:** H1, H3, H4, O1, O2 and O3 compared to the canvas.
