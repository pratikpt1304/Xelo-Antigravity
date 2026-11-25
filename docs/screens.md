# Screens and acceptance checklist

Every line is an acceptance item. IDs are referenced by the phase skills and `/xeio-parity-check`. **[P#]** is the build phase that delivers it. The canvas board for each section is named in brackets.

## G. Global

- [ ] **G1 [P1]** Landing page at `/`: static, fast, XeIO and elzeo branding, a "Sign in" link to `/app/login`, sitemap and robots, no inline scripts.
- [ ] **G2 [P1]** Sign-in page (`Main.dc.html`):
  - Left dark panel: XeIO wordmark, "Designed and maintained by" + elzeo logo.
  - Right: institutional email field.
  - Buttons: "Continue with Google", "Continue with Microsoft", and "Email me a sign-in link".
  - Domain check before sending.
  - Messages for not onboarded, deactivated and wrong domain.
- [ ] **G3 [P1]** Routing by role after sign-in. Deep links are kept through sign-in and refresh. A wrong-portal URL goes to the user's home. A not-found page exists.
- [ ] **G4 [P5]** Notifications bell in every portal: unread count, list, mark all read, realtime arrival, links to the item.
- [ ] **G5 [P5]** Personal calendar link (ICS): copy and reset, on the faculty Session plan and the student Home.

## F. Faculty workspace (`Faculty.dc.html`)

- [ ] **F0 [P1]** Shell:
  - The rail shows the course card and nine steps (Plan 1–3, Prepare 4–5, Run 6–8, Complete 9), each with its count or state.
  - Top bar: Ask box (rule-based navigation, e.g. "open S13", "show 2301044"), live-lab chip, "Preview as student", AI meter (plan, runs left, today), bell.
  - Right column: Next best actions (rule-based, one button each) and a Today agenda.
  - "All my courses" link.
- [ ] **F-list [P2]** My courses list with "New course".
- [ ] **F1 [P2]** Course setup:
  - Details (code, title, L-T-P-C, programme, semester, section, year, allowed languages).
  - Outcomes table (code, statement, BTL, unit) with add/edit/delete.
  - CO–PO/PSO matrix with levels 0–3.
  - Rubric table with descriptions ("Earned in each session") that must total 50.
  - Session rules card.
  - HOD approval card: status, remark, "Send course plan to HOD". The plan is locked while sent or approved.
- [ ] **F1a [P2]** "Draft from syllabus with Assist":
  - Upload PDF/TXT or paste text.
  - Proposes COs (statement, BTL, unit) and a CO–PO map.
  - Editable table before insert; costs 1 AI run.
- [ ] **F2 [P2]** Batches:
  - Roster summary: students, joined, invites pending, class codes, "Resend N invites".
  - Roster import from CSV/Excel (roll, name, email), with domain validation and an even split at ≤ 65.
  - Per batch: name, class code, slot, room, lab staff, roll range, members list with joined/invited.
  - Move a student between batches before the first session.
- [ ] **F3 [P2]** Session plan:
  - Inputs: first lab day, last teaching day, lab weekdays, extra holidays (plus institution holidays), "reserve last day for makeup".
  - Chip showing available dates vs needed.
  - Short-by banner with an Assist merge suggestion and Accept.
  - Preview table grouped by date.
  - Save writes one date per session.
  - Sessions table titled "x/n active in calendar" (status none/draft/active/conducted) with a link "Review questions to activate sessions".
  - Calendar link.
- [ ] **F4 [P3]** Lab questions, per session:
  - 4 Assist candidates with CO, difficulty, statement, tests and validation note. Invalid ones are greyed and cannot be picked.
  - Pick 2; "Assist pick best 2"; bulk "Assist pick 2 for N sessions"; "Draft candidates for N remaining sessions".
  - "Write own question" (modal with statement, I/O, constraints, 2 visible + 3 hidden tests, reference solution).
  - "Upload own" (JSON, validated after insert).
  - Session status updates.
- [ ] **F5 [P3]** Pre/post banks:
  - Summary: "N/n sessions with both banks active", N awaiting approval.
  - Per session: pre/post × easy/medium/hard counts out of 15; items list with stem, options and answer (faculty only).
  - Edit and delete items; add an item; overlap chip and per-item "overlaps the other bank".
  - "Approve bank" for pre and for post; bulk "Approve N ready banks"; bulk "Generate N missing banks with Assist".
  - "Upload MCQs (CSV)" with format help.
- [ ] **F6 [P4]** Sessions:
  - Batch switch.
  - Session chip grid: dark = completed, outlined = today, light = ready, faint = not ready.
- [ ] **F6a [P4]** Attendance modal:
  - Opens first, before the lab starts. Seat grid suggested from check-ins; click cycles present → late → absent.
  - Counts summary.
  - "Confirm and open session" closes the pre-test and starts the lab. "Later" is also available.
- [ ] **F6b [P4]** Session header: state chip, KPIs (present, late, absent, pre-test taken, all hidden passed, alerts), remark field, "End session".
- [ ] **F6c [P4]** Pre-test performance: 0–5 histogram, % correct by level, an insight line, and the list of who skipped.
- [ ] **F6d [P4]** Alerts:
  - Kinds: struggling and idle, with checkboxes.
  - Hint input with "Send hint to N"; the hint appears in those students' IDE instantly.
  - "Send TA to seats" modal using batch staff names, with copy and print.
  - "Add to slow-learner list".
- [ ] **F6e [P4]** Live monitor table: roll, name, attendance, Q1/Q2 status (not started / in progress / visible passed / all passed), runs, pre, post, viva input (capped by rubric; disabled when absent). Updates within 2 s via realtime.
- [ ] **F6f [P4]** Student inspector:
  - KPIs: attendance, internal so far, sessions, average pre and post, submissions.
  - Session timeline chips; clicking one filters submissions and shows that session's rubric breakdown.
  - Submissions table with a code toggle.
- [ ] **F6p [P4]** Preview as student: read-only IDE for any session.
- [ ] **F7 [P5]** Classroom:
  - Class card: codes, joined, pending, "Resend invites".
  - "Jump to this week".
  - Weeks derived from session dates (title = topics, date, "This week").
  - Per week: tasks, resources and announcements; Add inline.
  - Task types: quiz, fill in the code, predict the output, debug, assignment, poll. The Assist draft is previewed with its answer key, then "Add to this week".
  - Resources: a link or a file upload (private, signed URL).
  - Announcements: "Draft with Assist".
  - Responses modal per task.
- [ ] **F8 [P7]** Assessments: a six-stage stepper per batch (Rules → Generate & approve 30 → HOD approval → Schedule → Attendance & conduct → Marks & attainment); see section E.
- [ ] **F9 [P5]** Reports, with tabs Course file, Internal report, Student lab files and Final marks.
- [ ] **F9a [P5]** Course file:
  - 14 sections, each with a status (Ready / To date (n) / After end-sem / Add text).
  - "Mark list (CSV)", "Actual log (CSV)", "Print / save as PDF".
  - BoS suggestions editor.
  - Printable preview of all sections with the elzeo footer.
- [ ] **F9b [P5]** Internal report:
  - KPIs: overall attainment, result, COs attained, class mean, slow count, fast count.
  - CO table: statement, % ≥ target bar, mean, below 40, 80+, level, result.
  - "Mark sheet (CSV)".
  - Distribution with a bell curve; selectable Internal or per CO; markers at 40, target and 80.
  - Insights list.
  - Add a student to the slow or fast list manually; slow and fast lists show rule and notes, with Remove.
  - Saves a course snapshot.
- [ ] **F9c [P5]** Student lab files: table of students, a student selector showing the per-session rubric breakdown, "Print all lab files", and links to each full lab file.
- [ ] **F9d [P5]** Final marks: pipeline chips (Faculty submitted → HOD approved → CoE accepted), returned remark, "Submit final marks to HOD".

## S. Student app (`Student.dc.html`)

- [ ] **S0 [P4]** Header:
  - Tabs: Home, Classroom, Today's lab (only when a lab is today), Lab file, End-sem (only when scheduled).
  - Bell, name · roll, sign out (visible on dark).
  - Footer credit.
- [ ] **S1 [P4]** Home:
  - Join with class code.
  - Coming up list.
  - Today panel: pre-test score or "Take it now", lab slot and room with "Open today's lab", post-test status.
  - Month calendar marking labs and exams, with the calendar link.
  - Course cards: internal /100, attendance %, today's lab button, end-sem button.
  - Previous semesters table (courses accepted by the CoE) with lab file links.
- [ ] **S2 [P5]** Classroom:
  - Header: batch, faculty, slot, room.
  - Labs table (pre-test, open lab).
  - Weeks with date and topics ("this week" marker).
  - Tasks answered inline (quiz, predict, poll, fill code, debug, assignment) with done/score.
  - Resources open via signed URL.
  - Announcements.
- [ ] **S3 [P4]** Pre-test and post-test screens:
  - 5 questions; one attempt.
  - Pre-test closes when attendance starts the lab; post-test is locked until all hidden tests pass and closes at 23:59.
- [ ] **S4 [P4]** Full-screen lab IDE:
  - Top bar: Q1/Q2 tabs with dots, language select, chips (pre-test score · closed, post-test locked/open, started time), Run, Submit, Exit.
  - Left: problem, CO/difficulty/test tags, visible tests with pass/fail, hidden summary "x/3 passed", post-test card.
  - Hint card from faculty (live).
  - Editor (per question per language starter, autosave 10 s and on run, restore on refresh).
  - Console: compile errors and per-test verdicts on Run; summary on Submit; runtime.
  - Opening the lab records a check-in.
- [ ] **S5 [P5]** Lab file (print-ready):
  - Title page: institution, school, department, course, student, roll, faculty and HOD signature lines, elzeo credit.
  - Declaration (canvas wording, with the student's name and roll): internal /100, attendance, sessions conducted, verification ID `XO-<code>-<roll>-<4 hex>`, QR to `/app/verify/<course>/<student>`, student signature, and the note "As of today. The final file is issued after the last working day and is needed to appear for the final practical."
  - Marks by rubric: component, per session, earned, out of, and internal with "scaled from x / 50".
  - Index: session, date, topic, attendance, pre, post, tests, viva, marks.
  - Record of submitted programs: session, program, submitted (date · language), visible, hidden, status, code toggle, "Show all code".
  - "Download as PDF" (print).
- [ ] **S6 [P5]** Public verify page `/app/verify/:course/:student`: confirms the record (name, course, internal, attendance) with no private data beyond that.
- [ ] **S7 [P7]** End-sem, before the day: date and time, room, duration, number of questions, eligibility table (attendance vs minimum, lab file link), rules.
- [ ] **S8 [P7]** Secure check and waiting room: SSO, camera and microphone, entire-screen share, single monitor, fullscreen ready, face detected, marked present, test activated. Start unlocks only when all pass. Consent text.
- [ ] **S9 [P7]** Proctored IDE:
  - No navigation.
  - Proctor bar: webcam preview, faces, screen shared, fullscreen, tab switches, copy/paste blocked, timer, save status.
  - Warnings on violations; 3 flag the attempt for review.
  - Autosave and resume with the remaining time.
- [ ] **S10 [P7]** End-sem result (after HOD approval and added to file): per question visible/hidden/marks, viva, total out of 60, "published after HOD approval".

## H. HOD console (`Hod.dc.html`)

- [ ] **H0 [P6]** Tabs: Overview, Approvals (badge), Courses, Live (badge), Final marks, plus a link to the faculty workspace.
- [ ] **H1 [P6]** Overview:
  - KPIs: lab courses, students, average attendance, average completion, at risk, waiting for you.
  - "Assist suggests": rule-based lines with their evidence.
  - Approval queue showing age.
  - Students at risk across the department: roll, name, course, attendance, reason.
- [ ] **H2 [P2/P6]** Approvals:
  - Course plans: COs, rubric, Assist checks, decision.
  - End-sem sets: rules, checks for CO coverage, difficulty spread and duplicates; view the 30.
  - Final marks: checks; "Approve and recommend to CoE".
  - A remark is required to decline.
- [ ] **H3 [P6]** Courses: code, title, faculty, students, sessions conducted/total, attendance, completion, at risk, plan, end-sem, final marks, live chip.
- [ ] **H4 [P6]** Live: labs today (time/slot, course·batch, session, room, status, present/enrolled, pre-test done, passed all, struggling), refreshed every 30 s; exams in progress.
- [ ] **H5 [P6]** Final marks pipeline per course.

## O. Dean, CoE and VC console (`Oversight.dc.html`)

- [ ] **O0 [P6]** Title by role. Tabs: Monitor, Courses, Internals, and (CoE/VC) Calendar and eligibility.
- [ ] **O1 [P6]** Monitor:
  - KPIs: departments, lab courses, students, labs live now, average attendance, average completion, CO attainment, at risk.
  - Departments table: department, school, courses, students, labs live, attendance, completion, CO attainment, at risk, plans pending, with HOD, accepted.
- [ ] **O2 [P6]** Courses: department filter; code, title, department, faculty, students, sessions, attendance, plan, internals; "Attainment" drill-in (read-only).
- [ ] **O3 [P6]** Internals:
  - Table: course, faculty, approved by (HOD · date), students, mean /100, below 40, status.
  - CoE only: "Fetch HOD-approved internals", "Accept into results", "Return to HOD" (remark required).
  - Dean and VC are view-only.
- [ ] **O4 [P6]** Calendar and eligibility (CoE/VC): minimum attendance %, institution holidays.

## A. Super admin console (`SuperAdmin.dc.html`)

- [ ] **A1 [P1]** Users:
  - Onboarded counts note.
  - Create login: name, institution, email (domain shown), role, school, department; sends the invitation.
  - Staff list with active/deactivated and pending invites; deactivate/reactivate.
- [ ] **A2 [P1]** Institutions: add an institution (name, domain), a school and a department; list with plan and validity.
- [ ] **A3 [P1]** Subscriptions:
  - Pro and Elite plan cards with editable caps and "N institutions · N faculty active".
  - Record a request (institution, plan, start, 3/6/12 months).
  - Requests table with "valid until"; approve/reject.
- [ ] **A4 [P1]** AI credits: per-faculty usage bar, today/daily cap, status (OK, Running low, Daily cap reached, Subscription runs used up), "valid until", "Move to Elite/Pro".
- [ ] **A5 [P1]** Audit log: when, action, object, actor name · role, detail; CSV export.

## E. End-sem assessment (faculty side, `Faculty.dc.html` → Assessments)

- [ ] **E1 [P7]** Rules: questions per student, difficulty mix totalling 40, COs covered, visible/hidden tests, marks per test, viva, duration. Shows the computed paper (25 per question, total 60). Rules lock once generation starts.
- [ ] **E2 [P7]** Generate 40 (1 AI run); select exactly 30 with ≥ 4 per CO; invalid ones greyed; "Assist pick best 30"; "Add to question bank and send to HOD".
- [ ] **E3 [P7]** HOD approval state; a declined set returns to E2 with the remark.
- [ ] **E4 [P7]** Schedule (only after approval): date, time, room. Notifies students and shows in calendars.
- [ ] **E5 [P7]** Attendance seat grid → "Confirm attendance and activate test".
  - Live proctor panel: started, absent, flags by type, submitted.
  - Grant extra time.
  - Mark a late student present.
  - "End test" autosubmits remaining papers.
- [ ] **E6 [P7]** Marks and attainment:
  - Marks list: roll, questions with CO, visible, hidden, viva entry, total, proctor flag (clean / reviewed), submitted.
  - Review flags.
  - End-sem CO attainment with a comparison to internals.
  - "Add to course file" (fills sections 11–13), only when all flags are reviewed.
