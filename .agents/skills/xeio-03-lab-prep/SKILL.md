---
name: xeio-03-lab-prep
description: Phase 3 of the XeIO build. Judge0 code runner, AI generation service and credits, lab question candidates with validation, pick 2, own and uploaded questions, pre/post MCQ banks, and the rule that activates sessions. Use after phase 2 is approved.
---

# Phase 3: Prepare

**PRD:** §5.4, §5.5, §6.3 (languages and limits), §9. **Screens:** F4, F5. **Canvas:** `Faculty.dc.html` steps 4–5.

## Schema and functions

- **Tables:**
  - `questions`: course, kind lab/endsem/task, session, assessment, co_code, difficulty, title, statement, input_spec, output_spec, constraints, status candidate/approved/rejected, source ai/faculty, valid, validation_note, created_by.
  - `test_cases`: question, ord, input, expected, hidden, marks.
  - `reference_solutions`: question, lang, code.
  - `session_questions`: session, slot 1–2, question.
  - `bank_items`: session, bank pre/post, level, stem, options jsonb (2–6), answer, approved.
- **RLS:**
  - Students read a question only through `student_can_see_question(q)`: the session is active or conducted and they are enrolled, or it is on their exam paper.
  - Students read only `hidden = false` test cases of those questions.
  - Students never read reference solutions or bank answers. The test-taking API returns items without answers.
- **Functions:**
  - `guard_question` (no status or valid changes by the API).
  - `pick_session_questions(session, q1, q2)`: both valid and approved.
  - `approve_bank(session, bank)`: exactly 15/15/15 and no overlap with the other bank (similarity ≥ 0.8 counts as overlap).
  - `refresh_session_status(session)`: becomes `active` only when 2 questions are picked and both banks are approved. Call it after each change.
  - `hidden_test_counts(question ids)` for students.
  - `authorize_run(question, context)` returns the hidden tests; service_role only, checks the caller may run it.

## Edge functions

- **`run-code`:**
  - Input `{question_id, lang, code, mode: run|submit, context: lab|exam, paper_id?}`, validated with zod; code ≤ 50,000 chars.
  - Run executes the visible tests. Submit executes visible + hidden through `authorize_run`.
  - Judge0 limits: CPU 2 s, memory 256 MB, output 64 KB, no network.
  - Compare outputs normalised (trailing spaces and newlines).
  - Store a `submissions` row on Submit (and on Run with counts) and return per-test verdicts for visible tests and only counts for hidden tests.
  - Rate limit 20 per minute per user. Lab submits are allowed only while the session run is open and the student is present.
- **`validate-question`:** runs the reference solution in every allowed language against all tests; sets `valid` and `validation_note` through a service update.
- **`ai-generate` kinds:**
  - `lab_candidates` (4 per session, aligned to the session CO and BTL; avoids existing titles; each with 2 visible + 3 hidden tests and a C reference). Store as candidates, then validate.
  - `bank` (45 + 45 items, no overlap; stores draft items).
  - Credits are charged per call through `consume_ai_credit`; refund (`charged = false`) when the output is invalid.
- **`_shared`:** `judge.ts` (`normalise`, `outputsMatch`, `toResult` hiding hidden output, `summarise`, `parseRunRequest`) and `judge0.ts` (language ids per env, base64). Unit-test both.

## Pure logic

`flows.ts`:
- `pickTwo(cands)`: the two valid ones with different difficulty, preferring medium + hard.
- `similarity(a, b)`, `overlaps(pre, post)`.
- `parseMcqCsv(text)`: columns stage, level, question, options separated by `|`, answer A–F.
- `parseQuestionsJson(text)`.

## UI

- **F4:** session select with status; candidate cards; pick 2; "Assist pick best 2"; bulk pick and bulk draft (sequential, stops on a cap error and keeps the exact error code); "Write own question" modal; "Upload own" JSON with a confirmation; validation states (validating, valid, invalid with the note, greyed).
- **F5:** per `docs/screens.md`, including the summary card, bulk approve or generate, CSV upload and overlap chips.
- The rail and Session plan show "x/n active" from session status.

## Tests

- **DB:**
  - A session activates only with 2 approved valid questions and both banks at 15/15/15.
  - Overlap refused.
  - Students never read hidden tests, answers or references.
  - `authorize_run` cannot be called by `authenticated`.
  - Students cannot use AI; AI on another faculty's course is refused; the daily cap is enforced.
- **Unit:** judge helpers, AI schema validators, `pickTwo`, overlaps, both parsers (good and bad files).
- **Edge:** `deno check` and `deno lint`; a mocked Judge0 test for run and submit verdicts and hidden redaction.
- **Screens:** F4 and F5 compared to the canvas.
