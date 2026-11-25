const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'You do not have permission to perform this action.',
  not_pending: 'This item is no longer pending.',
  not_found: 'The requested record was not found.',
  remark_required: 'Please enter a remark before declining or returning.',
  rubric_must_total_50: 'The session rubric must total exactly 50 marks.',
  not_onboarded:
    "This email isn't onboarded yet. Ask your faculty for an invite or your admin for an account.",
  not_invited:
    "This email isn't onboarded yet. Ask your faculty for an invite or your admin for an account.",
  account_deactivated: 'This account has been deactivated. Contact your administrator.',
  wrong_domain: 'Please use your institutional email address.',
  domain_mismatch: 'Email domain does not match the institution.',
  already_invited: 'This email already has an active account.',
  no_plan: 'No active AI subscription plan for this institution.',
  daily_cap: 'Daily cap reached; resets at midnight IST.',
  daily_cap_reached: 'Daily cap reached; resets at midnight IST.',
  total_cap: 'Subscription runs used up.',
  subscription_exhausted: 'Institution AI credits are used up.',
  invalid_cap: 'Plan caps must be valid positive numbers.',
  outcomes_required: 'Add at least one course outcome before submitting.',
  empty_roster: 'The roster CSV has no valid rows.',
  sessions_started: 'Students cannot be moved after a session has been conducted.',
  sessions_active: 'Session plan cannot be replaced once sessions are active.',
  invalid_plan: 'Provide at least one session topic and date.',
  pdf_too_large: 'Syllabus file must be 2 MB or smaller.',
  ai_validation_failed: 'Assist draft could not be validated. No credit was charged.',
  invalid_question: 'Selected questions must be valid before approving.',
  duplicate_question: 'Pick two distinct questions for the session.',
  bank_incomplete: 'Each bank must have at least 15 easy, 15 medium, and 15 hard items.',
  bank_overlap: 'Pre and post banks cannot share identical or overlapping questions.',
  already_submitted: 'You have already submitted this test.',
  test_closed: 'This test window is closed.',
  post_locked: 'Post-test unlocks after all hidden tests of your lab questions pass.',
  viva_exceeds_rubric: 'Viva marks cannot exceed the rubric maximum.',
  absent_student: 'Cannot enter viva marks for an absent student.',
  student_not_in_batch: 'Selected student does not belong to this batch.',
  empty_response: 'No data was returned from the server.',
  mix_must_total_40: 'Difficulty mix (Easy + Medium + Hard) must total 40 questions.',
  must_approve_30: 'Approve exactly 30 questions before submitting to HOD.',
  co_coverage_error: 'Approved questions must include at least 4 questions per Course Outcome.',
  not_approved: 'This assessment must be approved by the HOD before scheduling.',
  attendance_required: 'Mark attendance for students before activating the exam.',
  not_activated: 'The exam has not been activated by your faculty yet.',
  absent_or_unmarked: 'You are not marked present for this exam.',
  unreviewed_flags: 'Review all flagged proctor events before adding results to the course file.',
  duplicate_set: 'An assessment for this batch already exists.',
  deadline_passed: 'The exam deadline has passed.',
  already_ended: 'This exam has already ended.',
};

export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message.trim() : String(err).trim();
  if (ERROR_MESSAGES[raw]) return ERROR_MESSAGES[raw]!;
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(code)) return msg;
  }
  return 'Something went wrong. Please try again.';
}
