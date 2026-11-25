import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const VC_ID = '50000000-0000-4000-8000-000000000001';
const COE_ID = '50000000-0000-4000-8000-000000000002';
const DEAN1_ID = '50000000-0000-4000-8000-000000000003';
const HOD_CSE_ID = '50000000-0000-4000-8000-000000000004';
const HOD_IT_ID = '50000000-0000-4000-8000-000000000005';
const FAC_ID = '50000000-0000-4000-8000-000000000006';

describe('Phase 6 DB: Scoped oversight statistics, Dean/HOD isolation, and CoE guards', () => {
  it('computes course_stats (75% attendance, 25% completion) and enforces dept/school scoping', async () => {
    const db = await freshDb();
    const instId = (
      await db.query<{ id: string }>(`INSERT INTO institutions (name, email_domain) VALUES ('Sanjivani', 'sanjivani.edu.in') RETURNING id`)
    ).rows[0]!.id;
    const sch1 = (await db.query<{ id: string }>(`INSERT INTO schools (institution_id, name) VALUES ($1, 'SET') RETURNING id`, [instId])).rows[0]!.id;
    const sch2 = (await db.query<{ id: string }>(`INSERT INTO schools (institution_id, name) VALUES ($1, 'SCM') RETURNING id`, [instId])).rows[0]!.id;
    const cse = (await db.query<{ id: string }>(`INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'CSE', 'CSE') RETURNING id`, [instId, sch1])).rows[0]!.id;
    const it = (await db.query<{ id: string }>(`INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'IT', 'IT') RETURNING id`, [instId, sch2])).rows[0]!.id;

    await db.query(
      `INSERT INTO invites (institution_id, email, role, full_name, school_id, department_id) VALUES
        ($1, 'vc@sanjivani.edu.in', 'vc', 'VC', null, null),
        ($1, 'coe@sanjivani.edu.in', 'coe', 'CoE', null, null),
        ($1, 'dean@sanjivani.edu.in', 'dean', 'Dean SET', $2, null),
        ($1, 'hod.cse@sanjivani.edu.in', 'hod', 'HOD CSE', $2, $4),
        ($1, 'hod.it@sanjivani.edu.in', 'hod', 'HOD IT', $3, $5),
        ($1, 'fac@sanjivani.edu.in', 'faculty', 'Faculty', $2, $4)`,
      [instId, sch1, sch2, cse, it],
    );
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'vc@sanjivani.edu.in')`, [VC_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'coe@sanjivani.edu.in')`, [COE_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'dean@sanjivani.edu.in')`, [DEAN1_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'hod.cse@sanjivani.edu.in')`, [HOD_CSE_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'hod.it@sanjivani.edu.in')`, [HOD_IT_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac@sanjivani.edu.in')`, [FAC_ID]);

    const courseId = (
      await db.query<{ id: string }>(
        `INSERT INTO courses (institution_id, department_id, faculty_id, code, title, plan_status, final_status)
         VALUES ($1, $2, $3, 'CSL-101', 'C Lab', 'approved', 'hod_approved') RETURNING id`,
        [instId, cse, FAC_ID],
      )
    ).rows[0]!.id;
    const batchId = (await db.query<{ id: string }>(`INSERT INTO batches (course_id, name, class_code) VALUES ($1, 'A', 'XK7M2P') RETURNING id`, [courseId])).rows[0]!.id;
    const sessId = (await db.query<{ id: string }>(`INSERT INTO sessions (course_id, n, topic, status) VALUES ($1, 1, 'S1', 'conducted') RETURNING id`, [courseId])).rows[0]!.id;
    const q1 = (await db.query<{ id: string }>(`INSERT INTO questions (course_id, session_id, title, statement, valid, status) VALUES ($1, $2, 'Q1', 'Sum', true, 'approved') RETURNING id`, [courseId, sessId])).rows[0]!.id;
    await db.query(`INSERT INTO session_questions (session_id, slot, question_id) VALUES ($1, 1, $2)`, [sessId, q1]);
    const runId = (await db.query<{ id: string }>(`INSERT INTO session_runs (session_id, batch_id, attendance_done) VALUES ($1, $2, true) RETURNING id`, [sessId, batchId])).rows[0]!.id;

    // 4 students: 2 present (1 passes), 1 late, 1 absent -> attendance 75%, completion 25%
    const stuIds = [
      '50000000-0000-4000-8000-000000000011',
      '50000000-0000-4000-8000-000000000012',
      '50000000-0000-4000-8000-000000000013',
      '50000000-0000-4000-8000-000000000014',
    ];
    const states = ['present', 'present', 'late', 'absent'];
    for (let i = 0; i < 4; i++) {
      await db.query(`INSERT INTO invites (institution_id, email, role, full_name) VALUES ($1, $2, 'student', $3)`, [instId, `s${i}@sanjivani.edu.in`, `S${i}`]);
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [stuIds[i], `s${i}@sanjivani.edu.in`]);
      await db.query(`INSERT INTO enrollments (batch_id, course_id, student_id) VALUES ($1, $2, $3)`, [batchId, courseId, stuIds[i]]);
      await db.query(`INSERT INTO attendance (session_run_id, student_id, state) VALUES ($1, $2, $3)`, [runId, stuIds[i], states[i]]);
    }
    await db.query(
      `INSERT INTO submissions (course_id, session_id, student_id, question_id, lang, code, visible_passed, visible_total, hidden_passed, hidden_total)
       VALUES ($1, $2, $3, $4, 'c', 'int main(){}', 2, 2, 3, 3)`,
      [courseId, sessId, stuIds[0], q1],
    );

    const stats = await as(db, HOD_CSE_ID, (tx) => tx.query(`SELECT attendance_pct, completion_pct FROM course_stats(ARRAY[$1::uuid])`, [courseId]));
    expect(stats.rows[0]).toEqual({ attendance_pct: 75, completion_pct: 25 });

    // Other dept HOD gets 0 rows
    const otherStats = await as(db, HOD_IT_ID, (tx) => tx.query(`SELECT course_id FROM course_stats(ARRAY[$1::uuid])`, [courseId]));
    expect(otherStats.rows).toHaveLength(0);

    // Dean of SET sees CSE course
    const deanStats = await as(db, DEAN1_ID, (tx) => tx.query(`SELECT course_id FROM course_stats(ARRAY[$1::uuid])`, [courseId]));
    expect(deanStats.rows).toHaveLength(1);

    // Only CoE/VC can set_min_attendance
    const facErr = await err(as(db, FAC_ID, (tx) => tx.query(`SELECT set_min_attendance(80)`)));
    expect(facErr).toContain('forbidden');
    await as(db, COE_ID, (tx) => tx.query(`SELECT set_min_attendance(80)`));

    // VC/Dean cannot accept internals
    const vcErr = await err(as(db, VC_ID, (tx) => tx.query(`SELECT decide_final_marks($1, true, null)`, [courseId])));
    expect(vcErr).toContain('forbidden');
    await as(db, COE_ID, (tx) => tx.query(`SELECT decide_final_marks($1, true, null)`, [courseId]));

    await db.close();
  });
});
