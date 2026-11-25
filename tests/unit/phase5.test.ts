import { describe, expect, it } from 'vitest';
import { computeReport } from '../../src/lib/api/report';
import { attainmentLevel, coAttainment, overallAttainment, poAttainment } from '../../src/lib/logic/attainment';
import { toCsv } from '../../src/lib/logic/csv';
import { buildIcs, foldIcsLine } from '../../src/lib/logic/ics';
import { classifyLearners } from '../../src/lib/logic/stats';

describe('Phase 5 unit: attainment, stats, csv, ics, and computeReport', () => {
  it('computes CO attainment levels, overall weights, and PO attainment', () => {
    expect(attainmentLevel(82)).toBe(3);
    expect(attainmentLevel(74)).toBe(2);
    expect(attainmentLevel(60)).toBe(1);
    expect(attainmentLevel(59)).toBe(0);

    const co = coAttainment([80, 70, 50, 60], 60);
    expect(co.pctAttaining).toBe(75);
    expect(co.level).toBe(2);

    expect(overallAttainment(80, 70)).toBe(74);
    expect(overallAttainment(80, null)).toBe(80);

    const po = poAttainment(new Map([['co1', 3]]), [{ co_id: 'co1', po_code: 'PO1', level: 2 }]);
    expect(po.PO1).toBe(3);
  });

  it('classifies slow (<40 or bottom 10%) and fast (top 10%) learners', () => {
    const students = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, score: (i + 1) * 10 }));
    const { slow, fast } = classifyLearners(students);
    expect(slow.map((s) => s.id)).toEqual(['s0', 's1', 's2']); // 10, 20, 30 (<40)
    expect(fast.map((s) => s.id)).toEqual(['s9']); // 100
  });

  it('quotes CSV cells with BOM and formula neutralization', () => {
    const csv = toCsv(['Name', 'Note'], [['Asha', '=1+1, "ok"']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=1+1, ""ok"""');
  });

  it('folds ICS lines at 75 chars and builds VCALENDAR', () => {
    const folded = foldIcsLine('SUMMARY:' + 'A'.repeat(90));
    expect(folded.split('\r\n')[0]?.length).toBe(75);
    const ics = buildIcs([{ uid: '1', title: 'CSL-101 S1: Loops', day: '2027-01-04' }]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270104');
  });

  it('computes course report across conducted sessions', () => {
    const report = computeReport({
      course: {
        id: 'c1',
        institution_id: 'i1',
        department_id: 'd1',
        faculty_id: 'f1',
        code: 'CSL-101',
        title: 'C Lab',
        ltpc: '0-0-4-2',
        programme: 'B.Tech',
        semester: 4,
        section: 'SY-B',
        academic_year: '2026-27',
        plan_status: 'approved',
        plan_remark: null,
        rubric: { attendance: 10, pre_test: 5, post_test: 5, visible: 10, hidden: 10, viva: 10 },
        allowed_langs: ['c'],
        attainment_target: 60,
        final_status: 'draft',
      },
      outcomes: [{ id: 'co1', course_id: 'c1', code: 'CO1', statement: 'Loops', btl: 3, unit: 1 }],
      sessions: [{ id: 's1', course_id: 'c1', n: 1, topic: 'Loops', co_id: 'co1', btl: 3, scheduled_date: '2027-01-04', status: 'conducted' }],
      enrollments: [{ id: 'e1', batch_id: 'b1', course_id: 'c1', student_id: 'stu1' }],
      profiles: [{ id: 'stu1', full_name: 'Asha', email: 'asha@sanjivani.edu.in', roll_no: '2301001' }],
      attendance: [{ id: 'a1', session_run_id: 'r1', student_id: 'stu1', state: 'present' }],
      attempts: [{ id: 't1', session_id: 's1', student_id: 'stu1', bank: 'pre', item_ids: [], answers: {}, score: 5, started_at: '', submitted_at: '2027-01-04' }],
      submissions: [{ id: 'sub1', course_id: 'c1', session_id: 's1', student_id: 'stu1', question_id: 'q1', context: 'lab', lang: 'c', code: '', visible_passed: 2, visible_total: 2, hidden_passed: 3, hidden_total: 3, runtime_ms: 10, created_at: '' }],
      vivas: [{ id: 'v1', student_id: 'stu1', session_id: 's1', marks: 10 }],
    });
    expect(report.rows[0]?.internal100).toBe(90); // 10+5+0+10+10+10 = 45/50 -> 90/100
  });
});
