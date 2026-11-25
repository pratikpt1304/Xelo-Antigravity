import { PGlite } from '@electric-sql/pglite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type DbRole = 'anon' | 'authenticated' | 'service_role';

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();

  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$;

    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `);

  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  if (existsSync(migrationsDir)) {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
      if (sql.trim()) {
        await db.exec(sql);
      }
    }
  }

  return db;
}

export async function as<T>(
  db: PGlite,
  uid: string | null,
  fn: (db: PGlite) => Promise<T>,
  role: DbRole = uid ? 'authenticated' : 'anon',
): Promise<T> {
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await db.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
    await db.exec(`SET LOCAL ROLE ${role}`);
    const out = await fn(db);
    await db.exec('COMMIT');
    return out;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

export async function err(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('Expected promise to reject, but it resolved');
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
