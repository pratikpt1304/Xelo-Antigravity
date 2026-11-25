import type { Rubric } from './checks';

export interface SessionMarksInput {
  attendance: 'present' | 'late' | 'absent' | null;
  preCorrect: number; // 0..5
  postCorrect: number; // 0..5
  questions: ReadonlyArray<{
    visiblePassed: number;
    visibleTotal: number;
    hiddenPassed: number;
    hiddenTotal: number;
  }>;
  viva: number;
}

export function sessionMarks(input: SessionMarksInput, rubric: Rubric): {
  attendance: number;
  pre: number;
  post: number;
  visible: number;
  hidden: number;
  viva: number;
  total: number;
} {
  if (input.attendance === 'absent') {
    return { attendance: 0, pre: 0, post: 0, visible: 0, hidden: 0, viva: 0, total: 0 };
  }

  const att =
    input.attendance === 'present'
      ? rubric.attendance
      : input.attendance === 'late'
        ? Math.round(rubric.attendance / 2)
        : 0;

  const pre = Math.round((Math.max(0, Math.min(5, input.preCorrect)) / 5) * rubric.pre_test);
  const post = Math.round((Math.max(0, Math.min(5, input.postCorrect)) / 5) * rubric.post_test);

  let visP = 0;
  let visT = 0;
  let hidP = 0;
  let hidT = 0;
  for (const q of input.questions) {
    visP += q.visiblePassed;
    visT += q.visibleTotal;
    hidP += q.hiddenPassed;
    hidT += q.hiddenTotal;
  }

  const visible = visT > 0 ? Math.round((visP / visT) * rubric.visible) : 0;
  const hidden = hidT > 0 ? Math.round((hidP / hidT) * rubric.hidden) : 0;
  const viva = Math.max(0, Math.min(rubric.viva, input.viva));

  return {
    attendance: att,
    pre,
    post,
    visible,
    hidden,
    viva,
    total: att + pre + post + visible + hidden + viva,
  };
}

export function internalOutOf100(sessionTotals: ReadonlyArray<number>): number {
  if (sessionTotals.length === 0) return 0;
  const avg50 = sessionTotals.reduce((a, b) => a + b, 0) / sessionTotals.length;
  return Math.round(avg50 * 2);
}

export function attendancePct(states: ReadonlyArray<'present' | 'late' | 'absent'>): number {
  if (states.length === 0) return 0;
  const presentCount = states.filter((s) => s === 'present' || s === 'late').length;
  return Math.round((presentCount / states.length) * 100);
}
