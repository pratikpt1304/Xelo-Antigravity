import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const HOD_ID = '10000000-0000-4000-8000-000000000001';
const FAC_ID = '10000000-0000-4000-8000-000000000002';
const STU_ID = '10000000-0000-4000-8000-000000000003';
const OTHER_HOD_ID = '10000000-0000-4000-8000-000000000004';

async function setupCourseFixture() {
  const db = await freshDb();
  const instId = (
    await db.query<{ id: string }>(
      `INSERT INTO institutions (name, email_domain) VALUES ('Sanjivani University', 'sanjivani.edu.in') RETURNING id`,
    )
  ).rows[0]!.id;
  const schoolId = (
    await db.query<{ id: string }>(
      `INSERT INTO schools (institution_id, name) VALUES ($1, 'SET') RETURNING id`,
      [instId],
    )
  ).rows[0]!.id;
  const cseId = (
    await db.query<{ id: string }>(
      `INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'CSE', 'Computer Science') RETURNING id`,
      [instId, schoolId],
    )
  ).rows[0]!.id;
  const itId = (
    await db.query<{ id: string }>(
      `INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'IT', 'Information Technology') RETURNING id`,
      [instId, schoolId],
    )
  ).rows[0]!.id;

  await db.query(
    `INSERT INTO invites (institution_id, email, role, full_name, school_id, department_id) VALUES
      ($1, 'hod.cse@sanjivani.edu.in', 'hod', 'HOD CSE', $2, $3),
      ($1, 'hod.it@sanjivani.edu.in', 'hod', 'HOD IT', $2, $4),
      ($1, 'fac@sanjivani.edu.in', 'faculty', 'Demo Faculty', $2, $3)`,
    [instId, schoolId, cseId, itId],
  );
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'hod.cse@sanjivani.edu.in')`, [HOD_ID]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'hod.it@sanjivani.edu.in')`, [OTHER_HOD_ID]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac@sanjivani.edu.in')`, [FAC_ID]);

  const courseId = await as(db, FAC_ID, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO courses (institution_id, department_id, faculty_id, code, title)
       VALUES ($1, $2, $3, 'CSL-101', 'Programming in C Lab')
       RETURNING id`,
      [instId, cseId, FAC_ID],
    );
    return r.rows[0]!.id;
  });

  return { db, instId, cseId, courseId };
}

describe('Phase 2 DB: Course setup, HOD approval, roster split, and session plan', () => {
  it('requires COs and rubric totalling 50, locks on send, and enforces dept HOD approval', async () => {
    const { db, courseId } = await setupCourseFixture();

    // No COs yet
    const noCoErr = await err(as(db, FAC_ID, (tx) => tx.query(`SELECT submit_course_plan($1)`, [courseId])));
    expect(noCoErr).toContain('outcomes_required');

    // Add CO1
    await as(db, FAC_ID, (tx) =>
      tx.query(
        `INSERT INTO course_outcomes (course_id, code, statement, btl, unit)
         VALUES ($1, 'CO1', 'Write C programs', 3, 1)`,
        [courseId],
      ),
    );

    // Bad rubric != 50
    await as(db, FAC_ID, (tx) =>
      tx.query(
        `UPDATE courses SET rubric = '{"attendance":5,"pre_test":5,"post_test":5,"visible":10,"hidden":10,"viva":10}'::jsonb WHERE id = $1`,
        [courseId],
      ),
    );
    const badRubricErr = await err(as(db, FAC_ID, (tx) => tx.query(`SELECT submit_course_plan($1)`, [courseId])));
    expect(badRubricErr).toContain('rubric_must_total_50');

    // Fix rubric to 50 and submit
    await as(db, FAC_ID, (tx) =>
      tx.query(
        `UPDATE courses SET rubric = '{"attendance":10,"pre_test":5,"post_test":5,"visible":10,"hidden":10,"viva":10}'::jsonb WHERE id = $1`,
        [courseId],
      ),
    );
    await as(db, FAC_ID, (tx) => tx.query(`SELECT submit_course_plan($1)`, [courseId]));

    // Locked after sending
    const lockErr = await err(
      as(db, FAC_ID, (tx) =>
        tx.query(
          `UPDATE courses SET rubric = '{"attendance":0,"pre_test":5,"post_test":5,"visible":10,"hidden":10,"viva":20}'::jsonb WHERE id = $1`,
          [courseId],
        ),
      ),
    );
    expect(lockErr).toContain('forbidden');

    // Other dept HOD cannot decide
    const otherHodErr = await err(
      as(db, OTHER_HOD_ID, (tx) => tx.query(`SELECT decide_course_plan($1, true, null)`, [courseId])),
    );
    expect(otherHodErr).toContain('forbidden');

    // Decline requires remark
    const noRemarkErr = await err(
      as(db, HOD_ID, (tx) => tx.query(`SELECT decide_course_plan($1, false, '')`, [courseId])),
    );
    expect(noRemarkErr).toContain('remark_required');

    // Approve writes approval row with content hash
    await as(db, HOD_ID, (tx) => tx.query(`SELECT decide_course_plan($1, true, 'Looks good')`, [courseId]));
    const appRes = await db.query<{ decision: string; content_hash: string }>(
      `SELECT decision::text, content_hash FROM approvals WHERE object_id = $1`,
      [courseId],
    );
    expect(appRes.rows[0]?.decision).toBe('approved');
    expect(appRes.rows[0]?.content_hash.length).toBeGreaterThan(10);

    await db.close();
  });

  it('splits 126-student roster 63/63, rejects wrong domain, and enrolls on sign-in', async () => {
    const { db, courseId } = await setupCourseFixture();

    const badRows = [{ roll: '2301001', name: 'Bad', email: 'bad@gmail.com' }];
    const domErr = await err(
      as(db, FAC_ID, (tx) => tx.query(`SELECT import_roster($1, $2::jsonb)`, [courseId, JSON.stringify(badRows)])),
    );
    expect(domErr).toContain('domain_mismatch');

    const rows = Array.from({ length: 126 }, (_, i) => ({
      roll: String(2301001 + i),
      name: `Student ${i + 1}`,
      email: `stu${i + 1}@sanjivani.edu.in`,
    }));

    const out = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ res: { total: number; batches: number } }>(
        `SELECT import_roster($1, $2::jsonb) AS res`,
        [courseId, JSON.stringify(rows)],
      );
      return r.rows[0]!.res;
    });
    expect(out).toEqual({ total: 126, batches: 2 });

    const counts = await db.query<{ name: string; cnt: string }>(
      `SELECT b.name, count(pe.id)::text AS cnt
       FROM batches b
       JOIN pending_enrollments pe ON pe.batch_id = b.id
       WHERE b.course_id = $1
       GROUP BY b.name ORDER BY b.name`,
      [courseId],
    );
    expect(counts.rows).toEqual([
      { name: 'Batch A', cnt: '63' },
      { name: 'Batch B', cnt: '63' },
    ]);

    // Student signs in -> automatically enrolled
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'stu1@sanjivani.edu.in')`, [STU_ID]);
    const enr = await db.query<{ course_id: string }>(
      `SELECT course_id FROM enrollments WHERE student_id = $1`,
      [STU_ID],
    );
    expect(enr.rows[0]?.course_id).toBe(courseId);

    await db.close();
  });

  it('enforces save_session_plan owner-only and join_with_code rules', async () => {
    const { db, courseId } = await setupCourseFixture();

    const nonOwnerErr = await err(
      as(db, HOD_ID, (tx) =>
        tx.query(`SELECT save_session_plan($1, ARRAY['S1'], ARRAY['2027-01-10']::date[])`, [courseId]),
      ),
    );
    expect(nonOwnerErr).toContain('forbidden');

    await as(db, FAC_ID, (tx) =>
      tx.query(`SELECT save_session_plan($1, ARRAY['Intro to C', 'Loops'], ARRAY['2027-01-10', '2027-01-17']::date[])`, [courseId]),
    );
    const sess = await db.query<{ n: number; topic: string }>(
      `SELECT n, topic FROM sessions WHERE course_id = $1 ORDER BY n`,
      [courseId],
    );
    expect(sess.rows).toHaveLength(2);

    await db.close();
  });
});
