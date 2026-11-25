export interface ExamRules {
  questions_per_student: number;
  mix: { easy: number; medium: number; hard: number };
  visible_count: number;
  hidden_count: number;
  marks_per_test: number;
  viva: number;
  duration_min: number;
}

export function validateExamRules(rules: ExamRules): string | null {
  const mixTotal = rules.mix.easy + rules.mix.medium + rules.mix.hard;
  if (mixTotal !== 40) return `Difficulty mix totals ${mixTotal} (must be 40).`;
  if (rules.questions_per_student < 1) return 'Must draw at least 1 question.';
  if (rules.marks_per_test < 1) return 'Marks per test must be positive.';
  return null;
}

export function examPaperMarks(rules: ExamRules): { perQuestion: number; total: number } {
  const perQuestion = (rules.visible_count + rules.hidden_count) * rules.marks_per_test;
  const total = perQuestion * rules.questions_per_student + rules.viva;
  return { perQuestion, total };
}

export function warningPolicy(warnCount: number): {
  warn: boolean;
  flagged: boolean;
  terminated: boolean;
} {
  return {
    warn: warnCount > 0,
    flagged: warnCount >= 3,
    terminated: false,
  };
}
