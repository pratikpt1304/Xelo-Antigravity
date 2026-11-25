import { describe, expect, it } from 'vitest';
import { as, err, freshDb } from './harness';

describe('PGlite Supabase stand-in harness', () => {
  it('boots and resolves auth.uid() and auth.role() per role', async () => {
    const db = await freshDb();
    const uid = '11111111-1111-4111-8111-111111111111';

    const anonOut = await as(db, null, async (tx) => {
      const res = await tx.query<{ uid: string | null; role: string }>(
        'SELECT auth.uid() AS uid, auth.role() AS role',
      );
      return res.rows[0];
    });
    expect(anonOut).toEqual({ uid: null, role: 'anon' });

    const authOut = await as(db, uid, async (tx) => {
      const res = await tx.query<{ uid: string | null; role: string }>(
        'SELECT auth.uid() AS uid, auth.role() AS role',
      );
      return res.rows[0];
    });
    expect(authOut).toEqual({ uid, role: 'authenticated' });

    const msg = await err(Promise.reject(new Error('forbidden')));
    expect(msg).toBe('forbidden');

    await db.close();
  });
});
