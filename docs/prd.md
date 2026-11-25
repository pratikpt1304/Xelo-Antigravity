
# XeIO — Product Requirements Document

2026-11-24 · Hariprasath K

[image: elzeo logo, light mode]

XeIO is an AI faculty assistant that plans, runs and reports every programming lab, from course setup to the NBA/NAAC course file. It is designed and maintained by **Elzeo Future Technologies Pvt Ltd, India**. This PRD is the build specification: an AI coding tool or engineering team should be able to implement XeIO from it and the reference UI canvas without further design decisions.

| Item | Value |
|---|---|
| Product | XeIO (web app; faculty, student, HOD, Dean, CoE, VC and super admin consoles) |
| Owner | Elzeo Future Technologies Pvt Ltd, India |
| Reference UI | XeIO Sample UI canvas (6 interactive boards; the visual source of truth) |
| Pilot customer | Sanjivani University, CSE department (domain @sanjivani.edu.in) |
| Pilot course | CSL-101 Programming in C Lab, SY-B, Sem 4, Jan–May 2027 |
| Status | Design final; ready for build |


## 1. Product overview

XeIO replaces the paper lab record, spreadsheet mark lists and manual attainment calculations with one workflow: the faculty member sets a course up once, XeIO's AI (“Assist”) drafts the questions, test banks and reports, and the faculty member approves every item before students see it.

**Problem.** Lab faculty spend most of their non-teaching time writing questions, checking code by hand, keeping attendance registers and assembling course files for accreditation. Students get late, inconsistent feedback. HODs and the CoE see marks only at semester end.

**Principles**

- AI drafts, people approve. Nothing AI-generated reaches a student without faculty approval; course plans, end-sem papers and final marks also need HOD approval.
- One flow, in order: Plan → Prepare → Run → Complete. The faculty rail shows where the course stands.
- Every mark is traceable to a rubric line, a test case, a submission and a timestamp.
- Outputs are accreditation-ready: CO–PO mapping, CO attainment and the 14-section course file are produced as a side effect of running the lab.

**Goals and success metrics (pilot semester)**

| Goal | Metric | Target |
|---|---|---|
| Reduce faculty prep time | Hours per week on questions, checking, registers | − 60% vs. previous semester |
| Faster feedback | Time from submission to test result | < 10 s (p95) |
| Reliable labs | Failed logins or lost submissions during a lab | 0 |
| Scale | Concurrent students in labs and exams | 500 without degradation |
| Accreditation | Course files generated without manual edits | 100% of pilot courses |
| Academic integrity | End-sem attempts with a reviewed proctor flag | All flags reviewed before marks publish |

**Out of scope for v1:** theory courses, fee and admission workflows, native mobile apps (the student app is responsive web), plagiarism checks across institutions.


## 2. Brand and design system (final)

The theme in the reference canvas is final: warm paper surfaces, a near-black rail, IBM Plex type, one teal for done/primary and one orange for Assist and alerts. Implement it as design tokens; no other colours or fonts.

**Logo usage**

- Product mark: the word **XeIO**, set in IBM Plex Sans 600, with “Xe” in the text colour and “IO” in blue: `#3FA9F5` on dark surfaces, `#1F5FE0` on light surfaces. The faculty sidebar reads “XeIO Assist”.
- Company logo: the elzeo wordmark with the tagline INNOVATE | TRANSFORM. Use the **dark-mode version** (white wordmark, transparent background) on the rail, the sign-in panel and the student header; use the **light-mode version** (navy wordmark) on paper surfaces, printed reports and the lab file.
- Placement: sign-in left panel (“Designed and maintained by” + full logo); faculty sidebar foot (“by” + wordmark); student header (small wordmark beside XeIO); student footer; every PDF export (course file, lab file, mark lists) in the footer: “XeIO · designed and maintained by Elzeo Future Technologies Pvt Ltd, India”.
- Minimum clear space: the height of the “e” on all sides; minimum width 72 px for the wordmark, 120 px for the logo with tagline. Never recolour, stretch or add effects.

[image: elzeo logo for light surfaces]

*Light mode: navy wordmark on paper and printed reports.*

[image: elzeo logo for dark surfaces]

*Dark mode: white wordmark on the rail, sign-in panel and student header.*

**Colour tokens**

| Token | Hex | Use |
|---|---|---|
| `rail` | `#141413` | Sidebar, student header, IDE chrome, dark panels, primary buttons |
| `paper` | `#F4F3EF` | App background |
| `surface` | `#FFFFFF` | Cards |
| `surface-alt` | `#FBFAF7` | Selected rows, problem panel |
| `border` | `#E2E0D8` | Card and input borders (1 px) |
| `ink` | `#141413` | Primary text |
| `muted` | `#6B6A63` | Secondary text |
| `teal` / `teal-tint` | `#0E5E52` / `#E6F0EC` | Done, approved, passed, small primary actions |
| `assist` / `assist-tint` | `#C2410C` / `#FFF1E8` | Assist suggestions, warnings, below-target values |
| `danger` / `danger-tint` | `#9F1D1D` / `#FBEAEA` | Absent, failed, declined |
| `brand-blue` | `#3FA9F5` (dark) / `#1F5FE0` (light) | “IO” in the wordmark and focus rings only |
| `editor-bg` / `console-bg` | `#1B1B1A` / `#11110F` | Code editor and console |

**Type:** IBM Plex Sans for UI (14 px body, 13 px secondary, 26 px page titles, 600 weight for headings); IBM Plex Mono for numbers, roll numbers, code, timers and kickers (“STEP 8 · RUN”); IBM Plex Serif for the printed lab file title page.

**Components:** radius 6 px (cards, buttons, inputs); 1 px borders, no shadows or gradients; segmented controls for filters; status chips (teal = done, orange = attention, red = failed, grey = pending); stage steppers with locked stages greyed and not clickable; tables with mono numerals; one primary action per card. Minimum touch target 32 px; WCAG 2.1 AA contrast for all text.


## 3. Roles and permissions

Seven roles, scoped by the institution's hierarchy: university → school → department → course → batch. A user may hold more than one role (a HOD who also teaches a lab); the UI offers a role switcher, and every action is checked server-side against role and scope.

| Role | Scope | Can do | Cannot do |
|---|---|---|---|
| Super admin (Elzeo) | All institutions | Create logins and map emails for VC, CoE, Dean, HOD, Faculty; approve subscriptions and durations; set AI credit caps; view audit log | Edit marks, questions or course content |
| VC | University | Monitor all schools, departments and courses; view internals and attainment | Approve or edit anything |
| CoE | University | Monitor; fetch HOD-approved internals; accept into results or return to HOD with a remark; set exam-eligibility thresholds | Edit marks directly |
| Dean | School | Monitor departments and courses in the school; view internals; set school-level eligibility thresholds | Approve course plans |
| HOD | Department | Approve/decline course plans, end-sem question sets and final marks (remark required to decline); live-monitor labs and exams; recommend marks to CoE | Edit a faculty member's questions |
| Faculty (course coordinator) | Own courses and batches | Everything in the faculty workspace (section 5); invite students; take attendance; activate tests | Approve own plan or paper |
| Student | Enrolled courses | Join with class code; attempt labs, tests and the end-sem; view own marks; download own lab file | See other students' data or hidden test cases |

**Rules**

- Exam eligibility = attendance threshold set by CoE/VC (default 75%), overridable downward only by the CoE with a logged reason.
- Approvals are immutable records: approver, timestamp, remark, and a hash of the approved content. Any later edit returns the item to “draft” and requires re-approval.
- Every read of student data by HOD, Dean, CoE or VC is logged.


## 4. Authentication, onboarding and subscriptions

There is no self-signup. Every account exists because a super admin created it or a faculty member invited it, and every sign-in uses the institution's identity provider.

**Sign-in (screen: Sign in, all roles)**

1. User enters an institutional email. XeIO checks the domain against the institution record (`@sanjivani.edu.in` for the pilot) and that the email is onboarded.
2. Redirect to institutional SSO (Google Workspace or Microsoft Entra ID via OIDC; SAML 2.0 optional). On return, XeIO matches the verified email to the account and routes by role: faculty → faculty workspace, student → student app, HOD → HOD console, Dean/CoE/VC → oversight console, super admin → admin console.
3. A valid institutional email that is not onboarded is refused with: “This email isn't onboarded yet. Ask your faculty for an invite or your admin for an account.”

Acceptance: no password field exists; sessions expire after 12 h (students) and 8 h idle (staff); a refresh during a lab or exam never logs the user out; sign-in p95 < 2 s at 500 concurrent sign-ins.

[image: Sign-in screen]

*Sign in (all roles): XeIO and elzeo branding left, institutional email SSO right.*

**Onboarding**

- Super admin creates staff logins (name, email, role, scope); the email domain must match the institution.
- Faculty onboard students by uploading the section roster (Excel/CSV: roll, name, email) or entering emails; XeIO sends an invitation email with the class code. Students can also join an already-invited course by entering the class code.
- A batch holds at most 65 students; the faculty splits a section into batches evenly (e.g. 126 → 63 + 63).

**Subscriptions (manual approval)**

| Plan | AI runs per subscription | Daily AI cap per faculty | Durations |
|---|---|---|---|
| Pro | 125 | 5 | 3, 6 or 12 months |
| Elite | 250 | 7 | 3, 6 or 12 months |

- An institution requests a plan, start date and duration; the super admin approves or rejects it manually. Caps are editable by the super admin per plan.
- An AI run = one Assist generation (a question set, a bank, a classroom task, an announcement draft, a report narrative). Viewing, approving and editing are free.
- When the daily cap or subscription total is reached, Assist buttons stay visible but return a clear message (“Daily cap reached; resets at midnight IST”); all non-AI features keep working.


## 5. Faculty workspace

The faculty workspace is a three-column layout: a dark rail with the course card and nine steps grouped Plan / Prepare / Run / Complete; the step's main panel; and a right column with **Next best actions** (Assist suggestions, each with one button) and today's agenda. A top bar holds the Ask box (natural-language navigation: “open today's session”, “show 2301044's submissions”), the live-lab indicator and the AI credit meter (plan, runs left, today's use).

Step numbers on the rail come from position: 1 Course setup, 2 Batches, 3 Session plan (Plan); 4 Lab questions, 5 Pre/post-test banks (Prepare); 6 Sessions, 7 Classroom, 8 Assessments (Run); 9 Reports (Complete).


### 5.1 Course setup

- Fields: course code, title, L-T-P-C, programme, semester, section, academic year, faculty in-charge.
- Course outcomes: CO1–COn, each with a statement and a Bloom's level (BTL 1–6). CO–PO/PSO matrix with levels 0–3.
- Marking rubric (per session, 50 raw, reported out of 100): Attendance 10, Pre-test 5, Post-test 5, Visible tests 10, Hidden tests 10, Viva 10. Editable before approval; must total 50.
- “Send course plan to HOD” locks the plan (draft → sent → approved/declined). Declined returns with the HOD's remark.
- Acceptance: a session cannot go live until the course plan is approved.


### 5.2 Batches

- Import the section roster; Assist splits it into batches of at most 65, evenly (126 → A 63, B 63). Faculty can move students between batches before the first session.
- Each batch has a lab slot (day, time, room) and its own class code.


### 5.3 Session plan

- Generated from the academic calendar: 15 lab periods × 2 sessions = 30 sessions (S1–S30), each with topic, CO, BTL, date, pre-test window and post-test window. Holidays from the calendar shift dates automatically.
- A session becomes **active in the calendar only when** its two lab questions and both test banks are approved (status: none → draft → active).


### 5.4 Lab questions

- Per session, Assist drafts 4 candidate questions aligned to the session's CO and BTL; faculty picks any 2, or adds or uploads their own (statement, I/O format, constraints, 2 visible + 3 hidden test cases, reference solution).
- Every question is validated before approval: the reference solution must pass all its test cases in every enabled language. Failing candidates are shown greyed and cannot be approved.
- Bulk: “Draft questions for N sessions” (one AI run per session).


### 5.5 Pre/post-test banks

- Each session has a pre-test bank and a post-test bank of 15 easy + 15 medium + 15 hard MCQ/short questions each, with no overlap between pre and post. Assist drafts; faculty approves the bank.
- Pre-test: 5 questions (2 easy, 2 medium, 1 hard) drawn per student; one attempt; closes when the lab starts.
- Post-test: 5 questions (1 easy, 2 medium, 2 hard); opens for a student only after all hidden test cases of both lab questions pass; closes 23:59 the same day.


### 5.6 Sessions (live lab)

- Opening a session first shows the attendance pop-up: seat grid of the batch, auto-suggested from sign-ins (present / late / absent), faculty confirms. Attendance is required before the session starts.
- Then: pre-test performance summary (who skipped, weak topics) and the live monitor: per student, question status (not started / visible passed / all passed), runs, last activity, flags.
- Clicking a student opens their progress from day 1 to today: every session, every submission with code, test results and timestamps.
- Viva marks are entered per student in the monitor.


### 5.7 Classroom

- A Moodle-like timeline of weeks; each week stacks tasks, resources and announcements, added inline.
- Assist tasks: quiz, fill in the code, predict the output, debug, coding assignment, poll. Faculty reviews before posting. Announcements can be drafted by Assist.
- Visible to the faculty and students enrolled with the class code.


### 5.8 Assessments (end-sem practical)

Six stages per batch: Rules → Generate and approve → HOD approval → Schedule → Attendance and conduct → Marks and attainment. Full rules in section 7.


### 5.9 Reports

Three tabs: Course file (14 sections), Internal report (CO-wise and overall attainment, bell curves, gaps, slow and fast learners, insights), Student lab files. Details in section 10.


### Faculty screens

[image: Course setup]

*5.1 Course setup: details, COs with BTL, CO–PO map, rubric, send to HOD.*

[image: Session plan]

*5.3 Session plan: 30 sessions from the academic calendar; active only when questions and banks are approved.*

[image: Lab questions]

*5.4 Lab questions: 4 Assist candidates per session, pick 2 or add your own.*

[image: Pre and post-test banks]

*5.5 Pre/post-test banks: 15 easy, 15 medium, 15 hard each, no overlap.*

[image: Live session with student inspector]

*5.6 Sessions: live monitor and one student's progress from day 1 with every submission.*

[image: Classroom timeline]

*5.7 Classroom: week timeline with inline add of AI tasks, resources and announcements.*

[image: Course file]

*5.9 Reports: the 14-section course file with per-section status.*

[image: Internal report]

*5.9 Reports: internal attainment, bell curve, gaps, slow and fast learners.*


## 6. Student app

Responsive web app with a dark header (XeIO + elzeo wordmark, tabs Home, Classroom, Today's lab, Lab file, End-sem practical, the student's name and roll) and a footer crediting Elzeo.


### 6.1 Home

Join a course with a class code; enrolled courses with marks so far (out of 100), attendance %, streak, the next lab; a month calendar of sessions, pre-tests, post-test deadlines and the end-sem.


### 6.2 Classroom

The faculty's week timeline (tasks, resources, announcements). Tasks show due date, status and score; AI tasks (quiz, fill in the code, predict the output, debug, poll) are answered inline.


### 6.3 Today's lab: full-screen IDE (LeetCode-style)

When the lab is open, the tab becomes a full-screen workspace below the header:

| Region | Size | Contents |
|---|---|---|
| Top bar | 44 px | Lab and session title; Question 1 / Question 2 tabs with a status dot (grey not run, orange visible passed, teal all passed); **Language** select; status chips (Pre-test score · closed, Post-test locked/open, Session ends HH:MM); **Run** and **Submit** |
| Left panel | 25% width (min 260 px), light | Title, CO / difficulty / test-count tags, problem statement, input, output, constraints; visible test cases with input, expected output and passed/failed state; hidden-test summary (“2/3 passed”, inputs never shown); post-test card |
| Editor | right 75%, top 75% | File tab (`main.c`, `main.cpp`, `Main.java`, `main.py`, `main.rs`, `main.go`), line numbers, syntax highlighting, auto-indent, bracket matching (Monaco or CodeMirror 6); autosave every 10 s and on every run |
| Console | right 75%, bottom 25% | Compile output and errors; per-test input / expected / output / verdict for Run; summary for Submit (“Visible 2/2, Hidden 3/3”); runtime and memory |

**Languages:** C (gcc 13, C17), C++ (g++ 13, C++20), Java (OpenJDK 21), Python (3.12), Rust (1.8x stable), Go (1.22+). Switching language loads that language's starter template; code is kept per question per language. Faculty can restrict the allowed languages per course.

**Rules**

- Run executes the 2 visible tests; Submit executes all 5 (2 visible + 3 hidden). Hidden inputs and outputs are never sent to the browser.
- Limits per run: 2 s CPU, 256 MB memory, 64 KB output, no network, no file system outside /tmp.
- When all hidden tests of both questions pass, the post-test unlocks until 23:59 the same day.
- Every Submit stores code, language, results and timestamp, and appears in the faculty monitor within 2 s.
- Acceptance: result returned in < 10 s p95 at 500 concurrent submitters; a page refresh restores the code, language and question.


### 6.4 Lab file

A print-ready record generated from the student's submissions: title page (institution, course, student, faculty in-charge and HOD signature lines), declaration page (original work, no AI tools, no indiscipline; internal marks out of 100, attendance %, a QR code that verifies the file, verification ID such as `XO-CSL101-2301034-7F3A`), index (session, title, date, attendance, pre, post, tests, viva, marks), and the record of submitted programs (code, tests passed/pending, submitted date). Download as PDF.


### 6.5 End-sem practical

Before the day: date, time, duration, room, batch, eligibility (attendance vs. threshold, lab file submitted) and the rules. On the day: secure check and waiting room, then the proctored IDE (section 7.4).


### Student screens

[image: Full-screen lab IDE]

*6.3 Today's lab: problem and tests left (25%), editor top-right (75% of height), console bottom-right, language select in the top bar.*

[image: Student lab file]

*6.4 Lab file: title page, declaration with marks, attendance and QR, index, record of programs.*


## 7. End-sem assessment and AI proctoring

Every batch sits a newly generated, HOD-approved paper, and a student can start only after the faculty marks them present and activates the test. The workflow is a strict state machine per batch; a stage unlocks only when the previous one is done.

[diagram: end-sem workflow per batch · 6 stages]

A declined set returns to approval; nothing after HOD approval can start early, and the accented stage is the only one a student sees.


### 7.1 Stage 1: Rules

| Rule | Default | Notes |
|---|---|---|
| Questions per student | 2 | Drawn from the approved 30 |
| Difficulty mix of the 40-question set | 12 easy, 16 medium, 12 hard | Must total 40 |
| COs covered | All course COs | Faculty may deselect a CO |
| Visible test cases per question | 2 | Shown to the student |
| Hidden test cases per question | 3 | Never shown |
| Marks per visible test | 5 |  |
| Marks per hidden test | 5 |  |
| Viva marks | 10 | Entered by the examiner |
| Duration | 120 min |  |

XeIO shows the computed paper: per question 2×5 + 3×5 = 25; 2 questions + viva 10 = 60 marks. Rules lock once generation starts.


### 7.2 Stage 2: Generate 40, approve 30

- One AI run generates 40 questions for the batch, each with CO, difficulty, statement, test cases and a reference solution validated in every allowed language. Questions never repeat a set used for another batch of the course in any semester.
- Faculty approves **exactly 30**, with at least 4 per selected CO. “Assist pick best 30” proposes a set balanced by CO and difficulty. Questions whose reference fails a test are shown greyed and cannot be approved.
- “Add to question bank and send to HOD” stores all 40 (approved and unapproved) in the department question bank, tagged by course, batch, CO, difficulty and usage, and sends the 30 to the HOD.


### 7.3 Stages 3–5: HOD approval, schedule, attendance and activation

1. **HOD approval.** The HOD reviews the 30 with Assist checks (CO coverage, difficulty spread, duplicate detection against the bank). Approve, or decline with a required remark (returns to stage 2).
2. **Schedule.** Only after approval, the faculty picks date, time and room; the test appears in the faculty, student, HOD and CoE calendars and students are notified.
3. **Attendance.** On the day, the faculty marks the batch present/absent in the seat grid.
4. **Activate.** “Confirm attendance and activate test” starts the clock. Only students marked present can start; absent students see “You are marked absent; contact your examiner.” A late student can be marked present later, which unblocks them with the remaining time.
5. **Conduct.** The faculty sees the live proctor panel (started, absent, lockdown status, tab switches, face flags, copy/paste/AI attempts, submitted) and ends the test; unsubmitted work autosubmits at time-out.


### 7.4 Proctoring and exam security

**Before start (secure check, all must pass):** institutional SSO; face match against the profile photo; webcam and microphone on; entire-screen sharing; single monitor and no virtual machine; browser lockdown and fullscreen ready; marked present; test activated.

**During the exam:**

- Same IDE layout as the lab, with no navigation tabs; a proctor bar shows webcam preview, camera (faces detected), screen shared, fullscreen locked, tab switches, copy/paste blocked, AI tools blocked, timer, and server save status.
- Lockdown: fullscreen enforced; exiting fullscreen, tab or window switches and focus loss are logged and warned (3 warnings → flagged for review, not auto-terminated). Clipboard, right-click, dev tools shortcuts, drag-and-drop and browser extensions are blocked or detected. Recommended: a Safe Exam Browser configuration for lab machines.
- AI proctor: face presence and count every 2 s, gaze-away and second-voice detection, screen frames sampled every 10 s; events stored with timestamps and thumbnails for the HOD/examiner review. AI flags never change marks on their own.
- Paper security: each student gets 2 questions drawn from the 30 at start; hidden tests stay server-side; code runs only in the sandbox.
- Resilience: autosave to the server every 10 s and on every run; on disconnect the timer pauses server-side for up to 5 minutes and the session resumes on the same or another approved machine with code and remaining time restored.


### 7.5 Stage 6: Marks and attainment

- Marks list per the rubric: roll, questions drawn (with CO), visible marks, hidden marks, viva, total, proctor flag (clean / flag reviewed), submitted time. Absent students are marked absent, not zero.
- CO attainment for the end-sem (% of students reaching the target per CO), with insights comparing end-sem to internals.
- “Add to course file” fills course-file sections 11 (end-sem questions), 12 (end-sem mark sheet) and 13 (overall attainment); final marks then go to the HOD for approval and recommendation to the CoE.


### Assessment screens

[image: Generate and approve]

*Stage 2: 40 generated, exactly 30 approved with CO coverage; failing candidates greyed out.*

[image: Attendance and conduct]

*Stage 5: attendance seat grid, activation for present students only, AI proctor panel.*

[image: Marks and attainment]

*Stage 6: marks list per rubric, CO attainment, add to course file.*

[image: Student secure check and waiting room]

*Student side: secure check and waiting room; start unlocks only when marked present and activated.*

[image: Proctored exam IDE]

*Student side: proctored IDE with lockdown bar, timer and server autosave; no navigation.*


## 8. Oversight and admin consoles


### 8.1 HOD console

Tabs: Overview, Approvals, Courses, Live, Final marks.

- **Approvals queue** with three item types: course plans (details, COs, CO–PO, rubric), end-sem question sets (30 per batch), and final marks. Each item shows Assist checks (e.g. “covers all COs”, “CO4 missing”, “rubric totals 50”) and a remark box; a remark is required to decline. Final marks: “Approve and recommend to CoE”.
- **Courses:** every course in the department with plan status, sessions conducted vs. planned, average marks and attainment.
- **Live:** labs and exams running now, with present count, progress and flags; drill into the faculty monitor read-only.
- **Final marks pipeline:** faculty submitted → HOD approved → CoE accepted, per course.


### 8.2 Dean, CoE and VC console

One console with a role switch; scope by role (Dean: school; CoE and VC: university).

- **Monitor:** departments table (courses, labs today, sessions on schedule, average attendance, attainment, pending approvals).
- **Courses:** filter by department, drill into a course's reports (read-only).
- **Internals (CoE only):** “Fetch HOD-approved internals” pulls newly approved courses; per course “Accept into results” or “Return to HOD” with a remark. Dean and VC see this view-only.


### 8.3 Super admin console (Elzeo)

- **Users:** create login (name, email, role, scope); domain must match the institution; deactivate; reassign.
- **Subscriptions:** plan cards for Pro and Elite with editable caps; requests with plan, start date and duration (3/6/12 months) to approve or reject; expiry reminders 30 and 7 days ahead.
- **AI credits:** per-faculty usage bars with status (OK, Running low, Daily cap reached, Subscription runs used up) and “Move to Elite/Pro”.
- **Audit:** immutable log of logins, approvals, mark changes, exam events and admin actions; exportable as CSV.


### Oversight screens

[image: HOD approvals]

*HOD approvals: course plans, end-sem sets and final marks with Assist checks.*

[image: CoE internals]

*CoE: fetch HOD-approved internals, accept into results or return to HOD.*

[image: Super admin credits]

*Super admin: AI credit usage per faculty against plan caps.*


## 9. AI features (Assist) and credits

Assist is a server-side service calling an LLM API with structured (JSON-schema) outputs; every output is validated, stored as a draft and shown for approval. Prompts include the course, CO statement, BTL, session topic and already-used questions to avoid repeats.

| Feature | Output | Validation before showing | Credits |
|---|---|---|---|
| Lab question candidates | 4 questions per session | Reference solution compiled and run against all tests in each allowed language | 1 run per session |
| Pre/post banks | 45 + 45 items per session, no overlap | Schema, answer key present, duplicate check | 1 run per bank pair |
| End-sem set | 40 questions per batch | As lab questions + no repeat across batches | 1 run per batch |
| Classroom tasks | Quiz, fill in the code, predict the output, debug, assignment, poll | Schema; code tasks executed | 1 run per task |
| Announcement draft | Text | Length, tone | 1 run |
| Report narratives | Insights in the internal report and course file summary | Numbers come only from computed data | 1 run per report |
| Next best actions, Ask box | Suggestions and navigation | Rule-based; no LLM call needed | Free |
| Proctor vision | Face count, gaze, screen events | On-device or server model, not the LLM | Not counted |

- Credits are counted per faculty against the institution's plan (Pro 125 / 5 per day, Elite 250 / 7 per day). The header meter shows runs left and today's use; a run that fails validation is not charged.
- Assist never writes marks; marks come only from test results, attendance and examiner entries.
- All prompts and outputs are logged with the requesting user and course for audit.


## 10. Reports, attainment and the course file

**Course file (14 sections, PDF with elzeo footer).** Each section shows a status: Ready, To date (S1–Sn), or After end-sem.

| # | Section | Source |
|---|---|---|
| 1 | Course details | Course setup |
| 2 | CO–PO/PSO mapping | Course setup |
| 3 | Session plan | Session plan |
| 4 | Actual log: planned vs. conducted, with remarks | Sessions |
| 5 | Marking rubric | Course setup (HOD-approved) |
| 6 | Lab questions | Lab questions |
| 7 | Mark list per rubric | Sessions |
| 8 | Internal CO attainment | Computed |
| 9 | Internal summary | Assist narrative over computed data |
| 10 | BoS suggestions | Faculty + Assist |
| 11 | End-sem questions | Assessments (stage 6) |
| 12 | End-sem mark sheet | Assessments (stage 6) |
| 13 | Overall attainment | Computed (internal + end-sem) |
| 14 | Overall summary | Assist narrative over computed data |

**Attainment rules (configurable per institution)**

- A student attains a CO when their score on items mapped to that CO is at least 60% (target threshold).
- CO attainment % = students attaining ÷ students assessed. Level 3 if ≥ 80%, level 2 if ≥ 70%, level 1 if ≥ 60%, else 0.
- Overall CO attainment = 0.4 × internal + 0.6 × end-sem (weights configurable); PO attainment = CO–PO weighted average of CO levels.

**Internal report:** CO-wise and overall attainment bars against the target line; mark distribution with bell curve per batch; gaps (COs and topics below target); slow learners (bottom 10% or < 40%) and fast learners (top 10%) with suggested actions; Assist insights.

**Student lab files:** list of students with marks, attendance, last submitted, and a link to each lab file (section 6.4); bulk download as ZIP.

**Mark lists:** downloadable as PDF and XLSX in the institution's format; final marks flow faculty → HOD → CoE.


## 11. Data model

PostgreSQL, one schema, every table carrying `institution_id` with row-level security. IDs are UUIDs; timestamps are `timestamptz` (displayed in IST).

| Entity | Key fields | Relations |
|---|---|---|
| institution | name, email_domain, plan, plan_start, plan_end, ai_total_cap, ai_daily_cap | has schools, users |
| school / department | name, dean_id / hod_id | department belongs to school |
| user | email (unique), name, roles[], scope_id, sso_subject, photo_url, status |  |
| subscription_request | institution_id, plan, start_date, months, status, decided_by, decided_at |  |
| course | code, title, ltpc, semester, section, year, faculty_id, plan_status, rubric jsonb, allowed_langs[] | department; has COs, batches, sessions |
| course_outcome | course_id, code, statement, btl | co_po_map(co_id, po_code, level) |
| batch | course_id, name, class_code, slot, room | enrollment(batch_id, student_id) |
| session | course_id, n, date, topic, co_id, btl, status, pre_open, pre_close, post_close | per batch: session_run(session_id, batch_id, started_at, conducted, remark) |
| question | course_id, kind (lab, endsem, task), co_id, difficulty, statement, io, constraints, status, source (ai, faculty), approved_by | test_case(question_id, input, expected, hidden bool, marks); reference_solution(question_id, lang, code) |
| session_question | session_id, question_id, slot (1, 2) |  |
| bank_item | session_id, bank (pre, post), level, stem, options jsonb, answer | test_attempt(student, session, bank, items, score, submitted_at) |
| attendance | session_run_id or exam_id, student_id, state (present, late, absent), marked_by, marked_at |  |
| submission | student_id, question_id, context (lab, exam), lang, code, visible_passed, hidden_passed, runtime_ms, created_at |  |
| viva | student_id, session_id or exam_id, marks, examiner_id |  |
| assessment | course_id, batch_id, rules jsonb, stage, hod_status, hod_remark, scheduled_at, activated_at, ended_at | assessment_question(assessment_id, question_id, approved bool); exam_paper(assessment_id, student_id, q1, q2) |
| proctor_event | exam_paper_id, type, severity, at, snapshot_url, reviewed_by |  |
| approval | object_type, object_id, approver_id, decision, remark, content_hash, at |  |
| class_item | batch_id, week, kind (task, resource, announcement), payload jsonb, due_at | class_response(item_id, student_id, answer, score) |
| ai_run | user_id, feature, course_id, tokens, status, charged bool, at |  |
| report_snapshot | course_id, kind, sections jsonb, pdf_url, generated_at |  |
| audit_log | actor_id, action, object, before, after, ip, at (append-only) |  |

Marks are never stored as edited totals: they are computed from attendance, attempts, submissions and viva rows, and frozen into `report_snapshot` at each approval.


## 12. Architecture, code execution and non-functional requirements

**Reference stack** (keeps the current hosting choices, fixes the failure points found in the LogicQ audit):

| Layer | Choice | Why |
|---|---|---|
| Web app | React + TypeScript (Next.js or Vite), hosted on Firebase Hosting / CDN | Static, cached, scales with no servers |
| Editor | Monaco (or CodeMirror 6) | Line numbers, highlighting, 6 languages |
| API | Node.js (NestJS or Fastify) on Cloud Run or Render (paid, always-on, autoscaling to ≥ 3 instances during labs) | No cold starts during a lab |
| Database and auth | Supabase Postgres (Pro or higher, connection pooler on) with RLS; SSO via Supabase Auth OIDC/SAML | One source of truth; pooled connections avoid the login failures seen at load |
| Realtime | Supabase Realtime or WebSockets for the live monitor, attendance and exam activation | Faculty sees submissions within 2 s |
| Code execution | Judge0 (self-hosted) or an isolated runner pool (gVisor/Firecracker) behind a queue | Untrusted code never runs on the API host |
| Queue | Redis/BullMQ or Cloud Tasks | Smooths 500 simultaneous submits |
| Files | Object storage (PDFs, snapshots), signed URLs |  |
| AI | LLM API with JSON schema outputs; proctor vision via a browser model (e.g. MediaPipe) + server checks |  |

**Key API groups:** `/auth`, `/admin/users`, `/admin/subscriptions`, `/courses` (setup, COs, rubric, plan submit), `/batches`, `/sessions` (plan, attendance, start, monitor stream), `/questions` (generate, validate, approve), `/banks`, `/attempts`, `/run` and `/submit` (enqueue execution, poll or stream result), `/classroom`, `/assessments` (rules, generate, approve, send, hod-decision, schedule, attendance, activate, end, results, add-to-course-file), `/proctor/events`, `/reports`, `/approvals`, `/ai/usage`. Every state change is a server-validated transition; the client never decides eligibility, unlocks or marks.

**Non-functional requirements**

- Load: 500 concurrent students in labs or exams; 500 sign-ins within 5 minutes; 500 submits within 60 s with p95 result < 10 s. Load-test before each semester.
- Availability 99.9% during scheduled labs and exams; status page; no deploys during exam windows.
- Durability: autosave every 10 s; an interrupted test or exam resumes from the server copy with remaining time (fixes the restart/snapshot bug).
- Security: OWASP ASVS L2; RLS on every table; hidden tests and answer keys never leave the server; rate limits on run/submit; CSP and security headers; secrets in a vault; daily backups with point-in-time recovery (7 days minimum).
- Privacy: proctor video is not recorded continuously, only event snapshots, kept 90 days then deleted; student data stays in an India region where available (DPDP Act 2023 compliance).
- Accessibility: WCAG 2.1 AA; keyboard use of the IDE; screen-reader labels.
- Observability: structured logs, traces on run/submit, alerts on queue depth > 200 or error rate > 1%.


## 13. Build phases and open items

Build in four phases; each ends with a demo on the reference canvas flows and a 500-user load test from phase 2 on.

1. **Foundation:** SSO sign-in and routing, super admin (users, subscriptions, credits), institution/department/course model, course setup with HOD plan approval, batches and invitations, theme and branding.
2. **Lab core:** session plan from the calendar, lab questions (AI 4 → pick 2, validation), pre/post banks, attendance, full-screen IDE with 6 languages and the sandboxed runner, live monitor, student progress, autosave and resume.
3. **Classroom and reports:** classroom timeline and AI tasks, internal report and attainment, student lab file with QR verification, course file sections 1–10, HOD console, Dean/CoE/VC console with internals fetch.
4. **End-sem:** assessments stages 1–6, HOD paper approval, calendar scheduling, attendance-gated activation, proctoring and lockdown, marks list and attainment into course file sections 11–14, final marks to CoE.

**Open items to confirm with Sanjivani University**

- Identity provider for SSO (Google Workspace or Microsoft Entra ID) and whether students' profile photos are available for face match.
- CO attainment threshold (60%) and internal/end-sem weights (40/60).
- Whether end-sem runs only on lab machines (Safe Exam Browser) or also on student laptops.
- Retention period for proctor snapshots (proposed 90 days) and consent wording.
- Course file format: any mandated university template or section order beyond the 14 sections.
- Languages allowed per course (all six by default).
- Whether question banks are shared across faculty teaching the same course.
