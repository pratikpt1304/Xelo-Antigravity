---
trigger: always_on
description: XeIO product principles, roles and scope. Applies to every task.
---

# XeIO product rules

## Principles (never break)

- **AI drafts, people approve.** Nothing AI-generated reaches a student without faculty approval. Course plans, end-sem papers and final marks also need HOD approval. Final marks then need CoE acceptance.
- **One flow, in order:** Plan → Prepare → Run → Complete. A later step can be locked until an earlier one is done. Locked stages show greyed and cannot be clicked.
- **Every mark is traceable** to a rubric line, test case, submission or attendance row, and a timestamp. Marks are computed from rows, never stored as edited totals.
- **The server decides.** The client never decides eligibility, unlocks, marks or permissions. Every state change is a server-validated transition (a database function or edge function) that raises a short error code on refusal.
- **Approvals are immutable records:** approver, timestamp, remark and content hash. A remark is required to decline or return.
- **Accreditation outputs are side effects** of running the lab: CO–PO map, CO attainment and the 14-section course file.

## Roles and scope

| Role | Scope | Home route |
|---|---|---|
| super_admin (Elzeo) | all institutions | `/app/admin` |
| vc, coe | university | `/app/oversight` |
| dean | school | `/app/oversight` |
| hod | department | `/app/hod` (plus a link to the faculty workspace) |
| faculty | own courses and batches | `/app/faculty` |
| student | enrolled courses | `/app/student` |

- **Single sign-in page for everyone.** The role on the account (from the invite) decides which portal loads. Never ask the user to pick a role.
- There is **no self-signup**. An account exists only because a super admin created it or a faculty member invited it, and the email domain must match the institution.
- A not-onboarded email gets: "This email isn't onboarded yet. Ask your faculty for an invite or your admin for an account."
- A deactivated account is refused at sign-in.
- Every portal route is guarded by role. A student opening `/app/admin` lands back in the student portal.
- Deep links survive sign-in and refresh. Wait for the session to be restored before redirecting anywhere.

## Fixed numbers (from the PRD; do not change without asking)

- Rubric per session = 50 raw, reported /100: attendance 10, pre-test 5, post-test 5, visible tests 10, hidden tests 10, viva 10.
- Batch ≤ 65 students, split evenly (126 → 63 + 63).
- Lab questions: Assist drafts 4 per session, faculty picks 2. Each has 2 visible and 3 hidden tests and a reference solution.
- Banks: 15 easy + 15 medium + 15 hard for pre and for post, with no overlap. Pre-test draws 2E + 2M + 1H, one attempt, and closes when attendance starts the lab. Post-test draws 1E + 2M + 2H, unlocks only when all hidden tests of both questions pass, and closes at 23:59 the same day.
- End-sem defaults:
  - 40 generated; faculty approves exactly 30, with at least 4 per CO.
  - 2 questions per student.
  - 2 visible and 3 hidden tests per question, 5 marks each.
  - Viva 10; duration 120 min.
  - Total 60 marks.
- Attainment: a student attains a CO at ≥ 60%. Levels: L3 at ≥ 80%, L2 at ≥ 70%, L1 at ≥ 60% of students attaining. Overall attainment = 0.4 × internal + 0.6 × end-sem.
- Exam eligibility: attendance ≥ institution minimum (default 75%).
- AI credits:
  - Pro: 125 runs per subscription, 5 per faculty per day.
  - Elite: 250 per subscription, 7 per day.
  - A run that fails validation is not charged.
  - Viewing, approving and editing are free.

## Product voice

- Plain, short, specific UI copy. Sentence case. No marketing language, no emoji.
- Assist is the name of the AI. Its suggestions are orange (assist colour) and always come with one action button.
- The product is lightweight. Keep animation to a minimum: no decorative motion, no parallax, no skeleton shimmer.

## Out of scope for v1

Theory courses, fees and admissions, native mobile apps (the student app is responsive web), and plagiarism checks across institutions.
