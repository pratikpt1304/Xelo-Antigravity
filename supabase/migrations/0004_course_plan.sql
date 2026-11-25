-- Phase 2: Course plan, outcomes, CO-PO map, batches, roster, sessions, holidays

CREATE TYPE plan_status AS ENUM ('draft', 'sent', 'approved', 'declined');
CREATE TYPE session_status AS ENUM ('none', 'draft', 'active', 'conducted');

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  code text NOT NULL,
  title text NOT NULL,
  ltpc text NOT NULL DEFAULT '0-0-4-2',
  programme text NOT NULL DEFAULT 'B.Tech',
  semester int NOT NULL DEFAULT 4,
  section text NOT NULL DEFAULT 'SY-B',
  academic_year text NOT NULL DEFAULT '2026-27',
  plan_status plan_status NOT NULL DEFAULT 'draft',
  plan_remark text,
  rubric jsonb NOT NULL DEFAULT '{"attendance":10,"pre_test":5,"post_test":5,"visible":10,"hidden":10,"viva":10}'::jsonb,
  allowed_langs text[] NOT NULL DEFAULT ARRAY['c', 'cpp', 'java', 'python', 'rust', 'go'],
  attainment_target int NOT NULL DEFAULT 60 CHECK (attainment_target BETWEEN 1 AND 100),
  final_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  code text NOT NULL,
  statement text NOT NULL,
  btl int NOT NULL CHECK (btl BETWEEN 1 AND 6),
  unit int NOT NULL DEFAULT 1,
  UNIQUE (course_id, code)
);

CREATE TABLE co_po_map (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  co_id uuid NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
  po_code text NOT NULL,
  level int NOT NULL CHECK (level BETWEEN 0 AND 3),
  PRIMARY KEY (co_id, po_code)
);

CREATE TABLE batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  class_code text NOT NULL UNIQUE,
  slot text NOT NULL DEFAULT 'Tue · 10:00–12:00',
  room text NOT NULL DEFAULT 'Lab 1',
  staff text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

CREATE TABLE pending_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  email text NOT NULL,
  roll_no text NOT NULL,
  full_name text NOT NULL,
  UNIQUE (course_id, email)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  n int NOT NULL CHECK (n >= 1),
  topic text NOT NULL,
  co_id uuid REFERENCES course_outcomes(id) ON DELETE SET NULL,
  btl int NOT NULL DEFAULT 3 CHECK (btl BETWEEN 1 AND 6),
  scheduled_date date,
  status session_status NOT NULL DEFAULT 'none',
  pre_open timestamptz,
  pre_close timestamptz,
  post_close timestamptz,
  UNIQUE (course_id, n)
);

CREATE TABLE holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  day date NOT NULL,
  label text NOT NULL,
  UNIQUE (institution_id, day)
);

-- Helpers
CREATE OR REPLACE FUNCTION is_course_faculty(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM courses WHERE id = p_course_id AND faculty_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_course_student(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrollments WHERE course_id = p_course_id AND student_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION can_oversee_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM courses c
    JOIN profiles p ON p.id = auth.uid() AND p.active = true
    LEFT JOIN departments d ON d.id = c.department_id
    WHERE c.id = p_course_id
      AND (
        p.role = 'super_admin'
        OR (
          c.institution_id = p.institution_id
          AND (
            p.role IN ('vc', 'coe')
            OR (p.role = 'dean' AND d.school_id = p.school_id)
            OR (p.role = 'hod' AND c.department_id = p.department_id)
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION can_read_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_course_faculty(p_course_id)
    OR is_course_student(p_course_id)
    OR can_oversee_course(p_course_id);
$$;

-- RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_po_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON courses, course_outcomes, co_po_map, batches, enrollments, pending_enrollments, sessions, holidays FROM anon;

CREATE POLICY courses_read ON courses
  FOR SELECT TO authenticated
  USING (faculty_id = me() OR can_read_course(id));

CREATE POLICY courses_insert ON courses
  FOR INSERT TO authenticated
  WITH CHECK (
    my_role() IN ('faculty', 'hod')
    AND faculty_id = me()
    AND institution_id = my_institution()
  );

CREATE POLICY courses_update ON courses
  FOR UPDATE TO authenticated
  USING (faculty_id = me())
  WITH CHECK (faculty_id = me());

CREATE POLICY course_outcomes_read ON course_outcomes
  FOR SELECT TO authenticated
  USING (can_read_course(course_id));

CREATE POLICY course_outcomes_write ON course_outcomes
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY co_po_map_read ON co_po_map
  FOR SELECT TO authenticated
  USING (can_read_course(course_id));

CREATE POLICY co_po_map_write ON co_po_map
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY batches_read ON batches
  FOR SELECT TO authenticated
  USING (can_read_course(course_id));

CREATE POLICY batches_write ON batches
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY enrollments_read ON enrollments
  FOR SELECT TO authenticated
  USING (student_id = me() OR is_course_faculty(course_id) OR can_oversee_course(course_id));

CREATE POLICY pending_enrollments_read ON pending_enrollments
  FOR SELECT TO authenticated
  USING (is_course_faculty(course_id) OR can_oversee_course(course_id));

CREATE POLICY sessions_read ON sessions
  FOR SELECT TO authenticated
  USING (can_read_course(course_id));

CREATE POLICY sessions_write ON sessions
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY holidays_read ON holidays
  FOR SELECT TO authenticated
  USING (is_super_admin() OR institution_id = my_institution());

CREATE POLICY holidays_write ON holidays
  FOR ALL TO authenticated
  USING (is_super_admin() OR (institution_id = my_institution() AND my_role() IN ('vc', 'coe')))
  WITH CHECK (is_super_admin() OR (institution_id = my_institution() AND my_role() IN ('vc', 'coe')));

-- Column guards
CREATE OR REPLACE FUNCTION guard_courses_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
      OR NEW.final_status IS DISTINCT FROM OLD.final_status
      OR NEW.faculty_id IS DISTINCT FROM OLD.faculty_id
      OR NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF OLD.plan_status IN ('sent', 'approved') AND NEW.rubric IS DISTINCT FROM OLD.rubric THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_courses_update
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION guard_courses_update();

CREATE OR REPLACE FUNCTION guard_batches_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    IF NEW.class_code IS DISTINCT FROM OLD.class_code
      OR NEW.course_id IS DISTINCT FROM OLD.course_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_batches_update
  BEFORE UPDATE ON batches
  FOR EACH ROW
  EXECUTE FUNCTION guard_batches_update();

CREATE OR REPLACE FUNCTION guard_sessions_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.course_id IS DISTINCT FROM OLD.course_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_sessions_update
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION guard_sessions_update();

-- Update handle_new_user to enroll pending students on first sign-in
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invites%ROWTYPE;
  v_domain text;
  v_pe pending_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_invited';
  END IF;

  SELECT email_domain INTO v_domain
  FROM institutions
  WHERE id = v_inv.institution_id;

  IF v_domain IS NULL OR email_domain(NEW.email) <> lower(v_domain) THEN
    RAISE EXCEPTION 'domain_mismatch';
  END IF;

  INSERT INTO profiles (
    id, institution_id, email, full_name, role, school_id, department_id, roll_no, active
  ) VALUES (
    NEW.id, v_inv.institution_id, lower(NEW.email), v_inv.full_name, v_inv.role,
    v_inv.school_id, v_inv.department_id, v_inv.roll_no, true
  );

  UPDATE invites SET accepted_at = now() WHERE id = v_inv.id;

  IF v_inv.role = 'student' THEN
    FOR v_pe IN
      SELECT * FROM pending_enrollments WHERE lower(email) = lower(NEW.email)
    LOOP
      INSERT INTO enrollments (batch_id, course_id, student_id)
      VALUES (v_pe.batch_id, v_pe.course_id, NEW.id)
      ON CONFLICT (course_id, student_id) DO NOTHING;
    END LOOP;
    DELETE FROM pending_enrollments WHERE lower(email) = lower(NEW.email);
  END IF;

  INSERT INTO audit_log (institution_id, actor_id, action, object_type, object_id, detail)
  VALUES (
    v_inv.institution_id, NEW.id, 'sign_up', 'profile', NEW.id::text,
    jsonb_build_object('email', lower(NEW.email), 'role', v_inv.role)
  );

  RETURN NEW;
END;
$$;

-- Workflows
CREATE OR REPLACE FUNCTION submit_course_plan(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course courses%ROWTYPE;
  v_co_count int;
  v_total int;
BEGIN
  SELECT * INTO v_course FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_course.faculty_id <> me() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_course.plan_status NOT IN ('draft', 'declined') THEN
    RAISE EXCEPTION 'not_pending';
  END IF;

  SELECT count(*)::int INTO v_co_count FROM course_outcomes WHERE course_id = p_course_id;
  IF v_co_count < 1 THEN
    RAISE EXCEPTION 'outcomes_required';
  END IF;

  SELECT
    COALESCE((v_course.rubric->>'attendance')::int, 0)
    + COALESCE((v_course.rubric->>'pre_test')::int, 0)
    + COALESCE((v_course.rubric->>'post_test')::int, 0)
    + COALESCE((v_course.rubric->>'visible')::int, 0)
    + COALESCE((v_course.rubric->>'hidden')::int, 0)
    + COALESCE((v_course.rubric->>'viva')::int, 0)
  INTO v_total;

  IF v_total <> 50 THEN
    RAISE EXCEPTION 'rubric_must_total_50';
  END IF;

  UPDATE courses
  SET plan_status = 'sent', plan_remark = NULL
  WHERE id = p_course_id;

  PERFORM audit('submit_course_plan', 'course', p_course_id::text, jsonb_build_object('code', v_course.code), v_course.institution_id);
END;
$$;

CREATE OR REPLACE FUNCTION decide_course_plan(
  p_course_id uuid,
  p_approve boolean,
  p_remark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course courses%ROWTYPE;
  v_prof profiles%ROWTYPE;
  v_hash text;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = me() AND active = true;
  SELECT * INTO v_course FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT FOUND OR v_prof.role <> 'hod' OR v_prof.institution_id <> v_course.institution_id
    OR v_prof.department_id IS DISTINCT FROM v_course.department_id
    OR v_course.faculty_id = me() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_course.plan_status <> 'sent' THEN
    RAISE EXCEPTION 'not_pending';
  END IF;

  IF NOT p_approve AND COALESCE(trim(p_remark), '') = '' THEN
    RAISE EXCEPTION 'remark_required';
  END IF;

  SELECT md5(
    COALESCE(v_course.rubric::text, '') || '|' ||
    COALESCE((SELECT string_agg(code || ':' || statement || ':' || btl, ',' ORDER BY code) FROM course_outcomes WHERE course_id = p_course_id), '') || '|' ||
    COALESCE((SELECT string_agg(co_id::text || ':' || po_code || ':' || level, ',' ORDER BY co_id, po_code) FROM co_po_map WHERE course_id = p_course_id), '')
  ) INTO v_hash;

  UPDATE courses
  SET plan_status = CASE WHEN p_approve THEN 'approved'::plan_status ELSE 'declined'::plan_status END,
      plan_remark = NULLIF(trim(COALESCE(p_remark, '')), '')
  WHERE id = p_course_id;

  INSERT INTO approvals (institution_id, object_type, object_id, approver_id, decision, remark, content_hash)
  VALUES (
    v_course.institution_id,
    'course_plan',
    p_course_id,
    me(),
    CASE WHEN p_approve THEN 'approved'::approval_decision ELSE 'declined'::approval_decision END,
    NULLIF(trim(COALESCE(p_remark, '')), ''),
    v_hash
  );

  PERFORM audit(
    CASE WHEN p_approve THEN 'approve_course_plan' ELSE 'decline_course_plan' END,
    'course',
    p_course_id::text,
    jsonb_build_object('remark', p_remark, 'hash', v_hash),
    v_course.institution_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION gen_class_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM batches WHERE class_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION import_roster(
  p_course_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course courses%ROWTYPE;
  v_domain text;
  v_total int;
  v_batches int;
  v_base int;
  v_rem int;
  v_b int;
  v_idx int := 0;
  v_row jsonb;
  v_email text;
  v_name text;
  v_roll text;
  v_batch_id uuid;
  v_batch_ids uuid[] := '{}';
  v_code text;
  v_existing_uid uuid;
BEGIN
  SELECT * INTO v_course FROM courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_course.faculty_id <> me() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email_domain INTO v_domain FROM institutions WHERE id = v_course.institution_id;
  v_total := jsonb_array_length(p_rows);
  IF v_total < 1 THEN
    RAISE EXCEPTION 'empty_roster';
  END IF;

  -- Validate domains first
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := lower(trim(v_row->>'email'));
    IF email_domain(v_email) <> lower(v_domain) THEN
      RAISE EXCEPTION 'domain_mismatch';
    END IF;
  END LOOP;

  v_batches := GREATEST(1, CEIL(v_total::numeric / 65)::int);
  v_base := v_total / v_batches;
  v_rem := v_total % v_batches;

  FOR v_b IN 1..v_batches LOOP
    v_code := gen_class_code();
    INSERT INTO batches (course_id, name, class_code)
    VALUES (p_course_id, 'Batch ' || chr(64 + v_b), v_code)
    RETURNING id INTO v_batch_id;
    v_batch_ids := array_append(v_batch_ids, v_batch_id);
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := lower(trim(v_row->>'email'));
    v_name := trim(v_row->>'name');
    v_roll := trim(v_row->>'roll');

    -- Determine which batch index (0-based)
    v_b := 0;
    DECLARE
      v_cum int := 0;
      v_sz int;
    BEGIN
      FOR i IN 1..v_batches LOOP
        v_sz := v_base + CASE WHEN i <= v_rem THEN 1 ELSE 0 END;
        IF v_idx < v_cum + v_sz THEN
          v_b := i;
          EXIT;
        END IF;
        v_cum := v_cum + v_sz;
      END LOOP;
    END;

    v_batch_id := v_batch_ids[v_b];

    SELECT id INTO v_existing_uid FROM profiles WHERE lower(email) = v_email;
    IF v_existing_uid IS NOT NULL THEN
      INSERT INTO enrollments (batch_id, course_id, student_id)
      VALUES (v_batch_id, p_course_id, v_existing_uid)
      ON CONFLICT (course_id, student_id) DO UPDATE SET batch_id = EXCLUDED.batch_id;
    ELSE
      INSERT INTO pending_enrollments (batch_id, course_id, email, roll_no, full_name)
      VALUES (v_batch_id, p_course_id, v_email, v_roll, v_name)
      ON CONFLICT (course_id, email) DO UPDATE SET batch_id = EXCLUDED.batch_id, roll_no = EXCLUDED.roll_no, full_name = EXCLUDED.full_name;

      INSERT INTO invites (institution_id, email, role, full_name, department_id, roll_no, class_code, created_by)
      SELECT v_course.institution_id, v_email, 'student', v_name, v_course.department_id, v_roll, b.class_code, me()
      FROM batches b WHERE b.id = v_batch_id
      ON CONFLICT DO NOTHING;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  PERFORM audit('import_roster', 'course', p_course_id::text, jsonb_build_object('count', v_total, 'batches', v_batches), v_course.institution_id);
  RETURN jsonb_build_object('total', v_total, 'batches', v_batches);
END;
$$;

CREATE OR REPLACE FUNCTION move_student(
  p_course_id uuid,
  p_student_id uuid,
  p_to_batch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_course_faculty(p_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF EXISTS (SELECT 1 FROM sessions WHERE course_id = p_course_id AND status = 'conducted') THEN
    RAISE EXCEPTION 'sessions_started';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM batches WHERE id = p_to_batch_id AND course_id = p_course_id) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  UPDATE enrollments
  SET batch_id = p_to_batch_id
  WHERE course_id = p_course_id AND student_id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION join_with_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof profiles%ROWTYPE;
  v_batch batches%ROWTYPE;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = me() AND active = true;
  IF NOT FOUND OR v_prof.role <> 'student' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_batch FROM batches WHERE upper(class_code) = upper(trim(p_code));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pending_enrollments
    WHERE course_id = v_batch.course_id AND lower(email) = lower(v_prof.email)
  ) AND NOT EXISTS (
    SELECT 1 FROM invites
    WHERE lower(email) = lower(v_prof.email) AND upper(COALESCE(class_code, '')) = upper(v_batch.class_code)
  ) AND NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE course_id = v_batch.course_id AND student_id = me()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO enrollments (batch_id, course_id, student_id)
  VALUES (v_batch.id, v_batch.course_id, me())
  ON CONFLICT (course_id, student_id) DO NOTHING;

  DELETE FROM pending_enrollments
  WHERE course_id = v_batch.course_id AND lower(email) = lower(v_prof.email);

  RETURN v_batch.course_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_session_plan(
  p_course_id uuid,
  p_topics text[],
  p_dates date[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_len int;
  i int;
BEGIN
  IF NOT is_course_faculty(p_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF EXISTS (SELECT 1 FROM sessions WHERE course_id = p_course_id AND status IN ('active', 'conducted')) THEN
    RAISE EXCEPTION 'sessions_active';
  END IF;

  v_len := COALESCE(array_length(p_topics, 1), 0);
  IF v_len < 1 OR v_len <> COALESCE(array_length(p_dates, 1), 0) THEN
    RAISE EXCEPTION 'invalid_plan';
  END IF;

  DELETE FROM sessions WHERE course_id = p_course_id;

  FOR i IN 1..v_len LOOP
    INSERT INTO sessions (course_id, n, topic, scheduled_date, status)
    VALUES (p_course_id, i, p_topics[i], p_dates[i], 'none');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION generate_session_plan(
  p_course_id uuid,
  p_n int DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topics text[] := '{}';
  v_dates date[] := '{}';
  i int;
BEGIN
  FOR i IN 1..p_n LOOP
    v_topics := array_append(v_topics, 'Lab Session ' || i);
    v_dates := array_append(v_dates, CURRENT_DATE + ((i - 1) * 7));
  END LOOP;
  PERFORM save_session_plan(p_course_id, v_topics, v_dates);
END;
$$;
