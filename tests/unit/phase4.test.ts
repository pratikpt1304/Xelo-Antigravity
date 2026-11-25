import { describe, expect, it } from 'vitest';
import { monitorAlerts, preTestAnalytics, weekOf } from '../../src/lib/logic/monitor';
import { attendancePct, internalOutOf100, sessionMarks } from '../../src/lib/logic/rubric';

const DEFAULT_RUBRIC = {
  attendance: 10,
  pre_test: 5,
  post_test: 5,
  visible: 10,
  hidden: 10,
  viva: 10,
};

describe('Phase 4 unit: rubric, analytics, and live monitor alerts', () => {
  it('computes sessionMarks with absent=0 and late=half attendance', () => {
    const absent = sessionMarks(
      { attendance: 'absent', preCorrect: 5, postCorrect: 5, questions: [], viva: 10 },
      DEFAULT_RUBRIC,
    );
    expect(absent.total).toBe(0);

    const late = sessionMarks(
      {
        attendance: 'late',
        preCorrect: 5,
        postCorrect: 5,
        questions: [{ visiblePassed: 2, visibleTotal: 2, hiddenPassed: 3, hiddenTotal: 3 }],
        viva: 8,
      },
      DEFAULT_RUBRIC,
    );
    expect(late.attendance).toBe(5);
    expect(late.total).toBe(43);
    expect(internalOutOf100([43, 47])).toBe(90);
    expect(attendancePct(['present', 'late', 'absent'])).toBe(67);
  });

  it('computes preTestAnalytics tolerating missing item_ids', () => {
    const res = preTestAnalytics(
      [{ score: 4 }, { score: 2, item_ids: ['i1'], answers: { i1: 0 } }],
      [{ id: 'i1', level: 'hard', answer: 1 }],
    );
    expect(res.histogram[4]).toBe(1);
    expect(res.histogram[2]).toBe(1);
    expect(res.levelPct.hard).toBe(0);
  });

  it('detects struggling (4+ runs, 0 passing) and idle (15+ min) students', () => {
    const now = new Date('2027-01-10T10:30:00Z');
    const subs = Array.from({ length: 4 }, () => ({
      student_id: 's1',
      visible_passed: 0,
      hidden_passed: 0,
      created_at: '2027-01-10T10:25:00Z',
    }));
    const drafts = new Map([['s2', '2027-01-10T10:00:00Z']]);
    const alerts = monitorAlerts(['s1', 's2', 's3'], subs, drafts, new Set(['s3']), now);

    expect(alerts.find((a) => a.studentId === 's1')?.kind).toBe('struggling');
    expect(alerts.find((a) => a.studentId === 's2')?.kind).toBe('idle');
    expect(alerts.find((a) => a.studentId === 's3')).toBeUndefined();
    expect(weekOf('2027-01-18', '2027-01-04')).toBe(3);
  });
});
