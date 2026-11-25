import { supabase } from '../supabase';
import { coAttainment, overallAttainment } from '../logic/attainment';
import { attendancePct, internalOutOf100, sessionMarks } from '../logic/rubric';
import type {
  AttendanceRow,
  Course,
  CourseOutcome,
  EnrollmentRow,
  Profile,
  SessionRow,
  SubmissionRow,
  TestAttemptRow,
  VivaRow,
} from '../types';

export async function fetchAll<T>(
  table: string,
  select = '*',
  filter?: { col: string; val: string },
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (filter) q = q.eq(filter.col, filter.val);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export interface StudentReportRow {
  studentId: string;
  rollNo: string;
  name: string;
  email: string;
  internal100: number;
  attendancePct: number;
  sessionTotals: number[];
  coPcts: Record<string, number>;
  endsemPct: number | null;
}

export interface ComputedCourseReport {
  rows: StudentReportRow[];
  conductedCount: number;
  coInternal: Record<string, { pctAttaining: number; level: 0 | 1 | 2 | 3; mean: number }>;
  coEndsem: Record<string, { pctAttaining: number; level: 0 | 1 | 2 | 3; mean: number }>;
  coOverall: Record<string, number>;
  overallPct: number;
}

export function computeReport(data: {
  course: Course;
  outcomes: CourseOutcome[];
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
  profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'roll_no'>[];
  attendance: AttendanceRow[];
  attempts: TestAttemptRow[];
  submissions: SubmissionRow[];
  vivas: VivaRow[];
  endsemScores?: Map<string, number>;
}): ComputedCourseReport {
  const conducted = data.sessions.filter((s) => s.status === 'conducted');
  const profMap = new Map(data.profiles.map((p) => [p.id, p]));

  const rows: StudentReportRow[] = data.enrollments.map((en) => {
    const prof = profMap.get(en.student_id);
    const attStates: Array<'present' | 'late' | 'absent'> = [];
    const sessionTotals: number[] = [];
    const coBuckets = new Map<string, number[]>();

    for (const s of conducted) {
      const att = data.attendance.find((a) => a.student_id === en.student_id)?.state ?? 'absent';
      attStates.push(att);
      const pre = data.attempts.find((a) => a.student_id === en.student_id && a.session_id === s.id && a.bank === 'pre')?.score ?? 0;
      const post = data.attempts.find((a) => a.student_id === en.student_id && a.session_id === s.id && a.bank === 'post')?.score ?? 0;
      const subs = data.submissions.filter((sub) => sub.student_id === en.student_id && sub.session_id === s.id);
      const viva = data.vivas.find((v) => v.student_id === en.student_id && v.session_id === s.id)?.marks ?? 0;

      const m = sessionMarks(
        {
          attendance: att,
          preCorrect: pre,
          postCorrect: post,
          questions: subs.map((x) => ({
            visiblePassed: x.visible_passed,
            visibleTotal: x.visible_total,
            hiddenPassed: x.hidden_passed,
            hiddenTotal: x.hidden_total,
          })),
          viva,
        },
        data.course.rubric,
      );
      sessionTotals.push(m.total);
      if (s.co_id) {
        const list = coBuckets.get(s.co_id) ?? [];
        list.push(m.total * 2);
        coBuckets.set(s.co_id, list);
      }
    }

    const internal100 = internalOutOf100(sessionTotals);
    const coPcts: Record<string, number> = {};
    for (const co of data.outcomes) {
      const vals = coBuckets.get(co.id);
      coPcts[co.code] = vals && vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : internal100;
    }

    return {
      studentId: en.student_id,
      rollNo: prof?.roll_no ?? '—',
      name: prof?.full_name ?? 'Student',
      email: prof?.email ?? '',
      internal100,
      attendancePct: attendancePct(attStates),
      sessionTotals,
      coPcts,
      endsemPct: data.endsemScores?.get(en.student_id) ?? null,
    };
  });

  const coInternal: ComputedCourseReport['coInternal'] = {};
  const coEndsem: ComputedCourseReport['coEndsem'] = {};
  const coOverall: Record<string, number> = {};

  for (const co of data.outcomes) {
    const intStats = coAttainment(rows.map((r) => r.coPcts[co.code] ?? 0), data.course.attainment_target);
    coInternal[co.code] = intStats;

    const endVals = rows.map((r) => r.endsemPct).filter((v): v is number => v !== null);
    const endStats = coAttainment(endVals, data.course.attainment_target);
    coEndsem[co.code] = endStats;
    coOverall[co.code] = overallAttainment(
      intStats.pctAttaining,
      endVals.length > 0 ? endStats.pctAttaining : null,
    );
  }

  const coOverallVals = Object.values(coOverall);
  const overallPct = coOverallVals.length
    ? Math.round(coOverallVals.reduce((a, b) => a + b, 0) / coOverallVals.length)
    : 0;

  return {
    rows,
    conductedCount: conducted.length,
    coInternal,
    coEndsem,
    coOverall,
    overallPct,
  };
}
