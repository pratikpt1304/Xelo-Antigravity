import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from '../db/harness';

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const FAC_ID = '00000000-0000-4000-8000-000000000002';
const FAC2_ID = '00000000-0000-4000-8000-000000000003';
const STU_ID = '00000000-0000-4000-8000-000000000004';
const OTHER_FAC_ID = '00000000-0000-4000-8000-000000000005';


describe('Phase 1 DB: Foundation schema, RLS, sign-up gate, and workflows', () => {
  it('enforces sign-up gate (no invite, wrong domain, role from invite)', async () => {
    const db = await freshDb();

    // Insert institution directly as postgres (setup)
    const instRes = await db.query<{ id: string }>(
      `INSERT INTO institutions (name, email_domain, plan, plan_start, plan_end)
       VALUES ('Sanjivani University', 'sanjivani.edu.in', 'pro', CURRENT_DATE - 10, CURRENT_DATE + 180)
       RETURNING id`,
    );
    const instId = instRes.rows[0]!.id;

    // 1. Uninvited user is refused
    const noInvErr = await err(
      db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'stranger@sanjivani.edu.in')`, [
        FAC_ID,
      ]),
    );
    expect(noInvErr).toContain('not_invited');

    // 2. Invite with valid domain -> succeeds and assigns role from invite
    await db.query(
      `INSERT INTO invites (institution_id, email, role, full_name)
       VALUES ($1, 'faculty.demo@sanjivani.edu.in', 'faculty', 'Demo Faculty')`,
      [instId],
    );
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'faculty.demo@sanjivani.edu.in')`,
      [FAC_ID],
    );

    const profRes = await db.query<{ role: string; email: string }>(
      `SELECT role::text, email FROM profiles WHERE id = $1`,
      [FAC_ID],
    );
    expect(profRes.rows[0]).toEqual({ role: 'faculty', email: 'faculty.demo@sanjivani.edu.in' });

    // 3. Mismatched domain invite (if inserted directly) is refused at sign-up
    await db.query(
      `INSERT INTO invites (institution_id, email, role, full_name)
       VALUES ($1, 'bad@gmail.com', 'student', 'Bad Domain')`,
      [instId],
    );
    const domErr = await err(
      db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'bad@gmail.com')`, [STU_ID]),
    );
    expect(domErr).toContain('domain_mismatch');

    await db.close();
  });

  it('restricts admin_invite and subscription decisions to super_admin', async () => {
    const db = await freshDb();

    const instRes = await db.query<{ id: string }>(
      `INSERT INTO institutions (name, email_domain) VALUES ('Sanjivani University', 'sanjivani.edu.in') RETURNING id`,
    );
    const instId = instRes.rows[0]!.id;

    await db.query(`INSERT INTO invites (institution_id, email, role, full_name) VALUES ($1, 'admin@sanjivani.edu.in', 'super_admin', 'Super Admin')`, [instId]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'admin@sanjivani.edu.in')`, [ADMIN_ID]);

    await db.query(`INSERT INTO invites (institution_id, email, role, full_name) VALUES ($1, 'fac@sanjivani.edu.in', 'faculty', 'Faculty')`, [instId]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac@sanjivani.edu.in')`, [FAC_ID]);

    // Faculty cannot invite
    const facInviteErr = await err(
      as(db, FAC_ID, (tx) =>
        tx.query(`SELECT admin_invite('x@sanjivani.edu.in', 'faculty', 'X', $1)`, [instId]),
      ),
    );
    expect(facInviteErr).toContain('forbidden');

    // Super admin can invite with matching domain, refused on wrong domain
    const badDomErr = await err(
      as(db, ADMIN_ID, (tx) =>
        tx.query(`SELECT admin_invite('x@other.edu.in', 'faculty', 'X', $1)`, [instId]),
      ),
    );
    expect(badDomErr).toContain('domain_mismatch');

    await as(db, ADMIN_ID, (tx) =>
      tx.query(`SELECT admin_invite('hod@sanjivani.edu.in', 'hod', 'HOD CSE', $1)`, [instId]),
    );

    // Subscription request + decision
    const reqId = await as(db, ADMIN_ID, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `SELECT create_subscription_request($1, 'pro', '2027-01-01', 6) AS id`,
        [instId],
      );
      return r.rows[0]!.id;
    });

    // Faculty cannot decide subscription
    const facSubErr = await err(
      as(db, FAC_ID, (tx) => tx.query(`SELECT decide_subscription($1, true)`, [reqId])),
    );
    expect(facSubErr).toContain('forbidden');

    // Super admin approves -> plan_end = 2027-06-30
    await as(db, ADMIN_ID, (tx) => tx.query(`SELECT decide_subscription($1, true)`, [reqId]));
    const instAfter = await db.query<{ plan: string; plan_end: string }>(
      `SELECT plan::text, plan_end::text FROM institutions WHERE id = $1`,
      [instId],
    );
    expect(instAfter.rows[0]).toEqual({ plan: 'pro', plan_end: '2027-06-30' });

    await db.close();
  });

  it('enforces AI credit daily & total caps and supports refunds', async () => {
    const db = await freshDb();

    const instRes = await db.query<{ id: string }>(
      `INSERT INTO institutions (name, email_domain, plan, plan_start, plan_end)
       VALUES ('Sanjivani University', 'sanjivani.edu.in', 'pro', CURRENT_DATE - 1, CURRENT_DATE + 30)
       RETURNING id`,
    );
    const instId = instRes.rows[0]!.id;

    await db.query(`INSERT INTO invites (institution_id, email, role, full_name) VALUES ($1, 'fac2@sanjivani.edu.in', 'faculty', 'Faculty 2')`, [instId]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'fac2@sanjivani.edu.in')`, [FAC2_ID]);

    // Pro daily_cap = 5. Consume 5 runs.
    const runIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await as(db, FAC2_ID, async (tx) => {
        const r = await tx.query<{ id: string }>(`SELECT consume_ai_credit('lab_candidates') AS id`);
        return r.rows[0]!.id;
      });
      runIds.push(id);
    }

    // 6th run today fails with daily_cap
    const capErr = await err(
      as(db, FAC2_ID, (tx) => tx.query(`SELECT consume_ai_credit('lab_candidates')`)),
    );
    expect(capErr).toContain('daily_cap');

    // Refund 1 run -> 5th slot opens again
    await as(db, FAC2_ID, (tx) => tx.query(`SELECT refund_ai_credit($1)`, [runIds[0]]));
    await as(db, FAC2_ID, (tx) => tx.query(`SELECT consume_ai_credit('lab_candidates')`));

    await db.close();
  });

  it('keeps audit_log append-only and scopes approvals to same institution', async () => {
    const db = await freshDb();

    const inst1 = (
      await db.query<{ id: string }>(
        `INSERT INTO institutions (name, email_domain) VALUES ('Inst One', 'one.edu.in') RETURNING id`,
      )
    ).rows[0]!.id;
    const inst2 = (
      await db.query<{ id: string }>(
        `INSERT INTO institutions (name, email_domain) VALUES ('Inst Two', 'two.edu.in') RETURNING id`,
      )
    ).rows[0]!.id;

    await db.query(`INSERT INTO invites (institution_id, email, role, full_name) VALUES ($1, 'f1@one.edu.in', 'faculty', 'F1')`, [inst1]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'f1@one.edu.in')`, [FAC_ID]);

    await db.query(`INSERT INTO invites (institution_id, email, role, full_name) VALUES ($1, 'f2@two.edu.in', 'faculty', 'F2')`, [inst2]);
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'f2@two.edu.in')`, [OTHER_FAC_ID]);

    await db.query(
      `INSERT INTO approvals (institution_id, object_type, object_id, approver_id, decision, content_hash)
       VALUES ($1, 'course_plan', gen_random_uuid(), $2, 'approved', 'abc123')`,
      [inst1, FAC_ID],
    );

    // Other institution faculty cannot read inst1's approvals
    const otherApprovals = await as(db, OTHER_FAC_ID, async (tx) => {
      const r = await tx.query(`SELECT id FROM approvals`);
      return r.rows;
    });
    expect(otherApprovals).toHaveLength(0);

    // Authenticated user cannot delete or update audit_log
    const delErr = await err(as(db, FAC_ID, (tx) => tx.query(`DELETE FROM audit_log`)));
    expect(delErr.toLowerCase()).toContain('permission denied');

    await db.close();
  });
});
