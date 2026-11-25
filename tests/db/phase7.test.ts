import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const HOD_ID = '60000000-0000-4000-8000-000000000001';
const FAC_ID = '60000000-0000-4000-8000-000000000002';
const STU1_ID = '60000000-0000-4000-8000-000000000003';
const STU2_ID = '60000000-0000-4000-8000-000000000004';

describe('Phase 7 DB: End-sem 6-stage state machine and proctoring', () => {
  it('enforces rules, 30 with >=4 per CO, HOD approval before schedule, attendance gate, and flag review', async () => {
    const db = await freshDb();
    const instId = (await db.query<{ id: string }>(`INSERT INTO institutions (name, email_domain) VALUES ('Sanjivani', 'sanjivani.edu.in') RETURNING id`)).rows[0]!.id;
    const schId = (await db.query<{ id: string }>(`INSERT INTO schools (institution_id, name) VALUES ($1, 'SET') RETURNING id`, [instId])).rows[0]!.id;
    const deptId = (await db.query<{ id: string }>(`INSERT INTO departments (institution_id, school_id, code, name) VALUES ($1, $2, 'CSE', 'CSE') RETURNING id`, [instId, schId])).rows[0]!.id;

    await db.query(
      `INSERT INTO invites (institution_id, email, role, full_name, department_id) VALUES
        ($1, 'hod@sanjivani.edu.in', 'hod', 'HOD', $2),
        ($1, 'fac@sanjivani.edu.in', 'faculty', 'Faculty', $2),
        ($1, 's1@sanjivani.edu.in', 'student', 'S1', $2),
        ($1, 's2@sanjivani.edu.in', 'student', 'S2', $2)`,
      [instId, deptId],
    );
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'hod@sanjivani.edu.in')`, [HOD_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac@sanjivani.edu.in')`, [FAC_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 's1@sanjivani.edu.in')`, [STU1_ID]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 's2@sanjivani.edu.in')`, [STU2_ID]);

    const courseId = (await db.query<{ id: string }>(`INSERT INTO courses (institution_id, department_id, faculty_id, code, title, plan_status) VALUES ($1, $2, $3, 'CSL-101', 'C Lab', 'approved') RETURNING id`, [instId, deptId, FAC_ID])).rows[0]!.id;
    const batchId = (await db.query<{ id: string }>(`INSERT INTO batches (course_id, name, class_code) VALUES ($1, 'A', 'XK7M2P') RETURNING id`, [courseId])).rows[0]!.id;
    await db.query(`INSERT INTO enrollments (batch_id, course_id, student_id) VALUES ($1, $2, $3), ($1, $2, $4)`, [batchId, courseId, STU1_ID, STU2_ID]);

    // Bad mix (!= 40) refused
    const badMix = await err(
      as(db, FAC_ID, (tx) =>
        tx.query(`SELECT create_assessment($1, $2, '{"mix":{"easy":10,"medium":10,"hard":10}}'::jsonb, ARRAY['CO1','CO2'])`, [courseId, batchId]),
      ),
    );
    expect(badMix).toContain('mix_must_total_40');

    const aId = await as(db, FAC_ID, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `SELECT create_assessment($1, $2, '{"questions_per_student":2,"mix":{"easy":12,"medium":16,"hard":12},"duration_min":120}'::jsonb, ARRAY['CO1','CO2']) AS id`,
        [courseId, batchId],
      );
      return r.rows[0]!.id;
    });

    // Cannot schedule before HOD approval
    const earlySched = await err(
      as(db, FAC_ID, (tx) => tx.query(`SELECT schedule_assessment($1, now() + interval '1 day', 'Lab 1')`, [aId])),
    );
    expect(earlySched).toContain('not_approved');

    // Insert 30 valid questions (15 CO1, 15 CO2)
    const qIds: string[] = [];
    for (let i = 0; i < 30; i++) {
      const qId = (
        await db.query<{ id: string }>(
          `INSERT INTO questions (course_id, kind, co_code, title, statement, valid) VALUES ($1, 'endsem', $2, $3, 'Solve', true) RETURNING id`,
          [courseId, i < 15 ? 'CO1' : 'CO2', `EQ-${i}`],
        )
      ).rows[0]!.id;
      await db.query(`INSERT INTO assessment_questions (assessment_id, question_id) VALUES ($1, $2)`, [aId, qId]);
      qIds.push(qId);
    }

    await as(db, FAC_ID, (tx) => tx.query(`SELECT send_assessment_to_hod($1, $2::uuid[])`, [aId, qIds]));
    await as(db, HOD_ID, (tx) => tx.query(`SELECT decide_assessment($1, true, 'Approved')`, [aId]));
    await as(db, FAC_ID, (tx) => tx.query(`SELECT schedule_assessment($1, now() + interval '1 day', 'Lab 1')`, [aId]));

    // Cannot activate without attendance
    const noAtt = await err(as(db, FAC_ID, (tx) => tx.query(`SELECT activate_assessment($1)`, [aId])));
    expect(noAtt).toContain('attendance_required');

    await as(db, FAC_ID, (tx) =>
      tx.query(`SELECT save_exam_attendance($1, $2::jsonb)`, [
        aId,
        JSON.stringify([
          { student_id: STU1_ID, state: 'present' },
          { student_id: STU2_ID, state: 'absent' },
        ]),
      ]),
    );
    await as(db, FAC_ID, (tx) => tx.query(`SELECT activate_assessment($1)`, [aId]));

    // Absent STU2 cannot start
    const absErr = await err(as(db, STU2_ID, (tx) => tx.query(`SELECT start_exam($1)`, [aId])));
    expect(absErr).toContain('absent_or_unmarked');

    // Present STU1 starts -> gets 2 questions
    const paper = await as(db, STU1_ID, async (tx) => {
      const r = await tx.query<{ res: { paper_id: string; q_ids: string[] } }>(`SELECT start_exam($1) AS res`, [aId]);
      return r.rows[0]!.res;
    });
    expect(paper.q_ids).toHaveLength(2);

    // Extra time works
    await as(db, FAC_ID, (tx) => tx.query(`SELECT grant_extra_time($1, 15)`, [paper.paper_id]));

    // 3 proctor warnings flag the paper
    await as(db, STU1_ID, (tx) => tx.query(`SELECT log_proctor_event($1, 'tab_switch', 2, '1')`, [paper.paper_id]));
    await as(db, STU1_ID, (tx) => tx.query(`SELECT log_proctor_event($1, 'tab_switch', 2, '2')`, [paper.paper_id]));
    const flagged = await as(db, STU1_ID, async (tx) => {
      const r = await tx.query<{ f: boolean }>(`SELECT log_proctor_event($1, 'fullscreen_exit', 2, '3') AS f`, [paper.paper_id]);
      return r.rows[0]!.f;
    });
    expect(flagged).toBe(true);

    await as(db, FAC_ID, (tx) => tx.query(`SELECT end_assessment($1)`, [aId]));

    // Cannot add to course file while flags unreviewed
    const unrevErr = await err(as(db, FAC_ID, (tx) => tx.query(`SELECT add_assessment_to_file($1)`, [aId])));
    expect(unrevErr).toContain('unreviewed_flags');

    // Review all events -> add_assessment_to_file succeeds
    const evs = await db.query<{ id: string }>(`SELECT id FROM proctor_events WHERE paper_id = $1`, [paper.paper_id]);
    for (const ev of evs.rows) {
      await as(db, FAC_ID, (tx) => tx.query(`SELECT review_proctor_event($1)`, [ev.id]));
    }
    await as(db, FAC_ID, (tx) => tx.query(`SELECT add_assessment_to_file($1)`, [aId]));

    await db.close();
  });
});
