import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const FAC_ID = '20000000-0000-4000-8000-000000000001';
const STU_ID = '20000000-0000-4000-8000-000000000002';

async function setupPrepFixture() {
  const db = await freshDb();
  const instId = (
    await db.query<{ id: string }>(
      `INSERT INTO institutions (name, email_domain, plan, plan_start, plan_end)
       VALUES ('Sanjivani', 'sanjivani.edu.in', 'pro', CURRENT_DATE - 1, CURRENT_DATE + 30) RETURNING id`,
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
      ($1, 'stu@sanjivani.edu.in', 'student', 'Student', $2)`,
    [instId, deptId],
  );
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac@sanjivani.edu.in')`, [FAC_ID]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'stu@sanjivani.edu.in')`, [STU_ID]);

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
  await db.query(`INSERT INTO enrollments (batch_id, course_id, student_id) VALUES ($1, $2, $3)`, [
    batchId,
    courseId,
    STU_ID,
  ]);
  const sessionId = (
    await db.query<{ id: string }>(
      `INSERT INTO sessions (course_id, n, topic) VALUES ($1, 1, 'Loops') RETURNING id`,
      [courseId],
    )
  ).rows[0]!.id;

  return { db, courseId, sessionId };
}

describe('Phase 3 DB: Lab prep activation, overlap refusal, and secret isolation', () => {
  it('activates session only with 2 valid questions and both 15/15/15 banks, and refuses overlap', async () => {
    const { db, courseId, sessionId } = await setupPrepFixture();

    const q1 = (
      await db.query<{ id: string }>(
        `INSERT INTO questions (course_id, session_id, title, statement, valid) VALUES ($1, $2, 'Q1', 'Sum', true) RETURNING id`,
        [courseId, sessionId],
      )
    ).rows[0]!.id;
    const q2 = (
      await db.query<{ id: string }>(
        `INSERT INTO questions (course_id, session_id, title, statement, valid) VALUES ($1, $2, 'Q2', 'Max', true) RETURNING id`,
        [courseId, sessionId],
      )
    ).rows[0]!.id;
    const qBad = (
      await db.query<{ id: string }>(
        `INSERT INTO questions (course_id, session_id, title, statement, valid) VALUES ($1, $2, 'QBad', 'Broken', false) RETURNING id`,
        [courseId, sessionId],
      )
    ).rows[0]!.id;

    // Invalid question cannot be picked
    const badPick = await err(
      as(db, FAC_ID, (tx) => tx.query(`SELECT pick_session_questions($1, $2, $3)`, [sessionId, q1, qBad])),
    );
    expect(badPick).toContain('invalid_question');

    // Pick 2 valid -> still draft because banks aren't approved
    const st1 = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ st: string }>(`SELECT pick_session_questions($1, $2, $3) AS st`, [sessionId, q1, q2]);
      return r.rows[0]!.st;
    });
    expect(st1).toBe('draft');

    // Insert 15/15/15 for pre and post
    for (const bank of ['pre', 'post'] as const) {
      for (const level of ['easy', 'medium', 'hard'] as const) {
        for (let i = 1; i <= 15; i++) {
          await db.query(
            `INSERT INTO bank_items (session_id, bank, level, stem, options, answer)
             VALUES ($1, $2, $3, $4, '["A","B","C","D"]'::jsonb, 0)`,
            [sessionId, bank, level, `${bank}-${level}-${i}`],
          );
        }
      }
    }

    await as(db, FAC_ID, (tx) => tx.query(`SELECT approve_bank($1, 'pre')`, [sessionId]));
    const stActive = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ st: string }>(`SELECT approve_bank($1, 'post') AS st`, [sessionId]);
      return r.rows[0]!.st;
    });
    expect(stActive).toBe('active');

    // Overlap check
    await db.query(
      `INSERT INTO bank_items (session_id, bank, level, stem, options, answer)
       VALUES ($1, 'post', 'easy', 'pre-easy-1', '["A","B"]'::jsonb, 0)`,
      [sessionId],
    );
    const overlapErr = await err(
      as(db, FAC_ID, (tx) => tx.query(`SELECT approve_bank($1, 'post')`, [sessionId])),
    );
    expect(overlapErr).toContain('bank_overlap');

    await db.close();
  });

  it('prevents students from reading hidden tests, bank answers, reference solutions, or authorize_run', async () => {
    const { db, courseId, sessionId } = await setupPrepFixture();

    const qId = (
      await db.query<{ id: string }>(
        `INSERT INTO questions (course_id, session_id, title, statement, valid, status)
         VALUES ($1, $2, 'Q1', 'Sum', true, 'approved') RETURNING id`,
        [courseId, sessionId],
      )
    ).rows[0]!.id;
    await db.query(`UPDATE sessions SET status = 'active' WHERE id = $1`, [sessionId]);
    await db.query(`INSERT INTO test_cases (question_id, ord, input, expected, hidden) VALUES ($1, 1, '1', '1', false), ($1, 2, '2', '2', true)`, [qId]);
    await db.query(`INSERT INTO reference_solutions (question_id, lang, code) VALUES ($1, 'c', 'int main(){}')`, [qId]);
    await db.query(`INSERT INTO bank_items (session_id, bank, level, stem, options, answer) VALUES ($1, 'pre', 'easy', 'S', '["A","B"]'::jsonb, 0)`, [sessionId]);

    const stuTests = await as(db, STU_ID, (tx) => tx.query(`SELECT hidden FROM test_cases WHERE question_id = $1`, [qId]));
    expect(stuTests.rows).toEqual([{ hidden: false }]);

    const stuRef = await as(db, STU_ID, (tx) => tx.query(`SELECT code FROM reference_solutions`));
    expect(stuRef.rows).toHaveLength(0);

    const stuBank = await as(db, STU_ID, (tx) => tx.query(`SELECT stem FROM bank_items`));
    expect(stuBank.rows).toHaveLength(0);

    const authRunErr = await err(
      as(db, STU_ID, (tx) => tx.query(`SELECT * FROM authorize_run($1, 'lab')`, [qId])),
    );
    expect(authRunErr.toLowerCase()).toContain('permission denied');

    // Students cannot use AI
    const stuAiErr = await err(
      as(db, STU_ID, (tx) => tx.query(`SELECT consume_ai_credit('lab_candidates')`)),
    );
    expect(stuAiErr).toContain('forbidden');

    await db.close();
  });
});
