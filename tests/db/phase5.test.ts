import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const COE_ID = '40000000-0000-4000-8000-000000000001';
const HOD_ID = '40000000-0000-4000-8000-000000000002';
const FAC_ID = '40000000-0000-4000-8000-000000000003';
const STU_ID = '40000000-0000-4000-8000-000000000004';

async function setupPhase5Fixture() {
  const db = await freshDb();
  const instId = (
    await db.query<{ id: string }>(`INSERT INTO institutions (name, email_domain) VALUES ('Sanjivani', 'sanjivani.edu.in') RETURNING id`)
  ).rows[0]!.id;
  const schoolId = (
    await db.query<{ id: string }>(`INSERT INTO schools (institution_id, name) VALUES ($1, 'SET') RETURNING id`, [instId])
  ).rows[0]!.id;
  const deptId = (
    await db.query<{ id: string }>(`INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'CSE', 'CSE') RETURNING id`, [instId, schoolId])
  ).rows[0]!.id;

  await db.query(
    `INSERT INTO invites (institution_id, email, role, full_name, department_id) VALUES
      ($1, 'coe@sanjivani.edu.in', 'coe', 'CoE', null),
      ($1, 'hod@sanjivani.edu.in', 'hod', 'HOD', $2),
      ($1, 'fac@sanjivani.edu.in', 'faculty', 'Faculty', $2),
      ($1, 'stu@sanjivani.edu.in', 'student', 'Student', $2)`,
    [instId, deptId],
  );
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'coe@sanjivani.edu.in')`, [COE_ID]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'hod@sanjivani.edu.in')`, [HOD_ID]);
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
    await db.query<{ id: string }>(`INSERT INTO batches (course_id, name, class_code) VALUES ($1, 'Batch A', 'XK7M2P') RETURNING id`, [courseId])
  ).rows[0]!.id;
  await db.query(`INSERT INTO enrollments (batch_id, course_id, student_id) VALUES ($1, $2, $3)`, [batchId, courseId, STU_ID]);

  return { db, courseId };
}

describe('Phase 5 DB: Classroom keys, notifications, calendar token, and final marks pipeline', () => {
  it('hides class_answer_keys from students and scores submit_class_response server-side', async () => {
    const { db, courseId } = await setupPhase5Fixture();

    const itemId = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO class_items (course_id, week, kind, task_type, title) VALUES ($1, 1, 'task', 'quiz', 'Quiz 1') RETURNING id`,
        [courseId],
      );
      return r.rows[0]!.id;
    });
    await as(db, FAC_ID, (tx) =>
      tx.query(`INSERT INTO class_answer_keys (item_id, answer) VALUES ($1, '{"choice":"B"}'::jsonb)`, [itemId]),
    );

    const stuKeys = await as(db, STU_ID, (tx) => tx.query(`SELECT * FROM class_answer_keys`));
    expect(stuKeys.rows).toHaveLength(0);

    const score = await as(db, STU_ID, async (tx) => {
      const r = await tx.query<{ s: number }>(`SELECT submit_class_response($1, '{"choice":"B"}'::jsonb) AS s`, [itemId]);
      return r.rows[0]!.s;
    });
    expect(score).toBe(1);

    await db.close();
  });

  it('enforces final marks pipeline (Faculty -> HOD -> CoE) and notifications', async () => {
    const { db, courseId } = await setupPhase5Fixture();

    await as(db, FAC_ID, (tx) => tx.query(`SELECT submit_final_marks($1)`, [courseId]));

    // HOD sees notification
    const hodNotifs = await as(db, HOD_ID, (tx) => tx.query(`SELECT kind FROM notifications`));
    expect(hodNotifs.rows.length).toBeGreaterThan(0);

    // Student cannot read HOD notifications
    const stuNotifs = await as(db, STU_ID, (tx) => tx.query(`SELECT kind FROM notifications`));
    expect(stuNotifs.rows).toHaveLength(0);

    // CoE cannot approve before HOD
    const earlyCoe = await err(as(db, COE_ID, (tx) => tx.query(`SELECT decide_final_marks($1, true, null)`, [courseId])));
    expect(earlyCoe).toContain('forbidden');

    // HOD approves -> CoE accepts
    await as(db, HOD_ID, (tx) => tx.query(`SELECT decide_final_marks($1, true, 'Verified')`, [courseId]));
    await as(db, COE_ID, (tx) => tx.query(`SELECT decide_final_marks($1, true, null)`, [courseId]));

    const status = await db.query<{ final_status: string }>(`SELECT final_status FROM courses WHERE id = $1`, [courseId]);
    expect(status.rows[0]?.final_status).toBe('coe_accepted');

    await db.close();
  });

  it('rotates calendar token and invalidates old token', async () => {
    const { db } = await setupPhase5Fixture();
    const oldTok = (await db.query<{ calendar_token: string }>(`SELECT calendar_token FROM profiles WHERE id = $1`, [FAC_ID])).rows[0]!.calendar_token;
    const newTok = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ t: string }>(`SELECT rotate_calendar_token() AS t`);
      return r.rows[0]!.t;
    });
    expect(newTok).not.toBe(oldTok);

    const oldErr = await err(db.query(`SELECT * FROM calendar_events($1)`, [oldTok]));
    expect(oldErr).toContain('invalid_token');

    await db.query(`SELECT * FROM calendar_events($1)`, [newTok]);
    await db.close();
  });
});
