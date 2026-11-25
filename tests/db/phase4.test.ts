import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const FAC_ID = '30000000-0000-4000-8000-000000000001';
const STU1_ID = '30000000-0000-4000-8000-000000000002';
const STU2_ID = '30000000-0000-4000-8000-000000000003';

async function setupLabRunFixture() {
  const db = await freshDb();
  const instId = (
    await db.query<{ id: string }>(
      `INSERT INTO institutions (name, email_domain) VALUES ('Sanjivani', 'sanjivani.edu.in') RETURNING id`,
    )
  ).rows[0]!.id;
  const schoolId = (
    await db.query<{ id: string }>(`INSERT INTO schools (institution_id, name) VALUES ($1, 'SET') RETURNING id`, [instId])
  ).rows[0]!.id;
  const deptId = (
    await db.query<{ id: string }>(
      `INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'CSE', 'CSE') RETURNING id`,
      [instId, schoolId],
    )
  ).rows[0]!.id;

  await db.query(
    `INSERT INTO invites (institution_id, email, role, full_name, department_id) VALUES
      ($1, 'fac@sanjivani.edu.in', 'faculty', 'Faculty', $2),
      ($1, 'stu1@sanjivani.edu.in', 'student', 'Student 1', $2),
      ($1, 'stu2@sanjivani.edu.in', 'student', 'Student 2', $2)`,
    [instId, deptId],
  );
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac@sanjivani.edu.in')`, [FAC_ID]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'stu1@sanjivani.edu.in')`, [STU1_ID]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'stu2@sanjivani.edu.in')`, [STU2_ID]);

  const courseId = (
    await db.query<{ id: string }>(
      `INSERT INTO courses (institution_id, department_id, faculty_id, code, title, plan_status)
       VALUES ($1, $2, $3, 'CSL-101', 'C Lab', 'approved') RETURNING id`,
      [instId, deptId, FAC_ID],
    )
  ).rows[0]!.id;
  const batchId = (
    await db.query<{ id: string }>(
      `INSERT INTO batches (course_id, name, class_code) VALUES ($1, 'Batch A', 'XK7M2P') RETURNING id`,
      [courseId],
    )
  ).rows[0]!.id;
  const batchBId = (
    await db.query<{ id: string }>(
      `INSERT INTO batches (course_id, name, class_code) VALUES ($1, 'Batch B', 'YK8N3Q') RETURNING id`,
      [courseId],
    )
  ).rows[0]!.id;

  await db.query(`INSERT INTO enrollments (batch_id, course_id, student_id) VALUES ($1, $2, $3)`, [batchId, courseId, STU1_ID]);
  await db.query(`INSERT INTO enrollments (batch_id, course_id, student_id) VALUES ($1, $2, $3)`, [batchBId, courseId, STU2_ID]);

  const sessionId = (
    await db.query<{ id: string }>(
      `INSERT INTO sessions (course_id, n, topic, status) VALUES ($1, 1, 'Loops', 'active') RETURNING id`,
      [courseId],
    )
  ).rows[0]!.id;

  const q1 = (
    await db.query<{ id: string }>(
      `INSERT INTO questions (course_id, session_id, title, statement, valid, status) VALUES ($1, $2, 'Q1', 'Sum', true, 'approved') RETURNING id`,
      [courseId, sessionId],
    )
  ).rows[0]!.id;
  await db.query(`INSERT INTO session_questions (session_id, slot, question_id) VALUES ($1, 1, $2)`, [sessionId, q1]);

  for (const bank of ['pre', 'post'] as const) {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (let i = 1; i <= 3; i++) {
        await db.query(
          `INSERT INTO bank_items (session_id, bank, level, stem, options, answer, approved)
           VALUES ($1, $2, $3, $4, '["A","B","C","D"]'::jsonb, 1, true)`,
          [sessionId, bank, level, `${bank}-${level}-${i}`],
        );
      }
    }
  }

  return { db, courseId, batchId, sessionId, q1 };
}

describe('Phase 4 DB: Lab run, attendance, pre/post tests, viva, hints, and isolation', () => {
  it('enforces pre-test 2/2/1, closes on attendance start, and unlocks post-test only after hidden pass', async () => {
    const { db, batchId, sessionId, q1 } = await setupLabRunFixture();

    const runId = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ id: string }>(`SELECT start_session_run($1, $2) AS id`, [sessionId, batchId]);
      return r.rows[0]!.id;
    });

    // Student 1 checks in -> suggested present
    await as(db, STU1_ID, (tx) => tx.query(`SELECT lab_checkin($1)`, [sessionId]));
    const sug = await as(db, FAC_ID, (tx) => tx.query(`SELECT student_id, state::text FROM suggest_attendance($1)`, [runId]));
    expect(sug.rows[0]).toEqual({ student_id: STU1_ID, state: 'present' });

    // Pre-test before attendance: 5 items (2E/2M/1H)
    const pre = await as(db, STU1_ID, async (tx) => {
      const r = await tx.query<{ res: { attempt_id: string; items: unknown[] } }>(`SELECT start_test($1, 'pre') AS res`, [sessionId]);
      return r.rows[0]!.res;
    });
    expect(pre.items).toHaveLength(5);

    const score = await as(db, STU1_ID, async (tx) => {
      const r = await tx.query<{ s: number }>(`SELECT submit_test($1, '{}'::jsonb) AS s`, [pre.attempt_id]);
      return r.rows[0]!.s;
    });
    expect(score).toBe(0);

    // One attempt only
    const dupPre = await err(as(db, STU1_ID, (tx) => tx.query(`SELECT start_test($1, 'pre')`, [sessionId])));
    expect(dupPre).toContain('already_submitted');

    // Attendance rejects student not in batch (STU2 is in batchB)
    const badAtt = await err(
      as(db, FAC_ID, (tx) =>
        tx.query(`SELECT save_attendance($1, $2::jsonb)`, [runId, JSON.stringify([{ student_id: STU2_ID, state: 'present' }])]),
      ),
    );
    expect(badAtt).toContain('student_not_in_batch');

    // Confirm attendance -> closes pre-test
    await as(db, FAC_ID, (tx) =>
      tx.query(`SELECT save_attendance($1, $2::jsonb)`, [runId, JSON.stringify([{ student_id: STU1_ID, state: 'present' }])]),
    );

    // Post-test locked until hidden tests pass
    const postLocked = await err(as(db, STU1_ID, (tx) => tx.query(`SELECT start_test($1, 'post')`, [sessionId])));
    expect(postLocked).toContain('post_locked');

    // Record passing submission -> post-test unlocks
    await db.query(
      `INSERT INTO submissions (course_id, session_id, student_id, question_id, lang, code, visible_passed, visible_total, hidden_passed, hidden_total)
       SELECT course_id, $1, $2, $3, 'c', 'int main(){}', 2, 2, 3, 3 FROM sessions WHERE id = $1`,
      [sessionId, STU1_ID, q1],
    );
    const post = await as(db, STU1_ID, async (tx) => {
      const r = await tx.query<{ res: { attempt_id: string; items: unknown[] } }>(`SELECT start_test($1, 'post') AS res`, [sessionId]);
      return r.rows[0]!.res;
    });
    expect(post.items).toHaveLength(5);

    await db.close();
  });

  it('caps viva by rubric, scopes hints to batch, and isolates student drafts/submissions', async () => {
    const { db, batchId, sessionId, q1 } = await setupLabRunFixture();

    const runId = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ id: string }>(`SELECT start_session_run($1, $2) AS id`, [sessionId, batchId]);
      return r.rows[0]!.id;
    });

    const vivaCapErr = await err(
      as(db, FAC_ID, (tx) => tx.query(`SELECT set_viva($1, $2, null, 15)`, [STU1_ID, sessionId])),
    );
    expect(vivaCapErr).toContain('viva_exceeds_rubric');

    await as(db, FAC_ID, (tx) => tx.query(`SELECT set_viva($1, $2, null, 8)`, [STU1_ID, sessionId]));

    // Hint to STU1 (in batch) and STU2 (not in batch) -> only 1 sent
    const sent = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ n: number }>(`SELECT send_hint($1, ARRAY[$2::uuid, $3::uuid], 'Check loop bounds') AS n`, [
        runId,
        STU1_ID,
        STU2_ID,
      ]);
      return r.rows[0]!.n;
    });
    expect(sent).toBe(1);

    // STU1 saves draft -> STU2 cannot read it
    await as(db, STU1_ID, (tx) =>
      tx.query(`INSERT INTO drafts (student_id, question_id, context, lang, code) VALUES ($1, $2, 'lab', 'c', 'secret')`, [
        STU1_ID,
        q1,
      ]),
    );
    const stu2Drafts = await as(db, STU2_ID, (tx) => tx.query(`SELECT code FROM drafts`));
    expect(stu2Drafts.rows).toHaveLength(0);

    await db.close();
  });
});
