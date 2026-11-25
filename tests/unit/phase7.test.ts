import { describe, expect, it } from 'vitest';
import { examPaperMarks, validateExamRules, warningPolicy } from '../../src/lib/logic/proctor';

describe('Phase 7 unit: exam rules, paper marks, and warning policy', () => {
  it('computes 25 per question / 60 total and validates mix=40', () => {
    const rules = {
      questions_per_student: 2,
      mix: { easy: 12, medium: 16, hard: 12 },
      visible_count: 2,
      hidden_count: 3,
      marks_per_test: 5,
      viva: 10,
      duration_min: 120,
    };
    expect(validateExamRules(rules)).toBeNull();
    expect(examPaperMarks(rules)).toEqual({ perQuestion: 25, total: 60 });
    expect(validateExamRules({ ...rules, mix: { easy: 10, medium: 10, hard: 10 } })).toContain('40');
  });

  it('flags at 3 warnings and never auto-terminates', () => {
    expect(warningPolicy(2)).toEqual({ warn: true, flagged: false, terminated: false });
    expect(warningPolicy(3)).toEqual({ warn: true, flagged: true, terminated: false });
  });
});
