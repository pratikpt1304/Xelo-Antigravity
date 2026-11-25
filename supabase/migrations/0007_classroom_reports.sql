-- Phase 5: Classroom, reports, final marks pipeline, notifications, calendar, QR verify

CREATE TABLE class_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week int NOT NULL CHECK (week BETWEEN 1 AND 30),
  kind text NOT NULL CHECK (kind IN ('task', 'resource', 'announcement')),
  task_type text,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at timestamptz,
  url text CHECK (url IS NULL OR url ~ '^https://'),
  file_path text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE class_answer_keys (
  item_id uuid PRIMARY KEY REFERENCES class_items(id) ON DELETE CASCADE,
  answer jsonb NOT NULL
);

CREATE TABLE class_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES class_items(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answer jsonb NOT NULL,
  score int NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, student_id)
);

CREATE TABLE course_notes (
  course_id uuid PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  bos_suggestions text NOT NULL DEFAULT '',
  internal_summary text NOT NULL DEFAULT '',
  overall_summary text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_snapshots (
  course_id uuid PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  students int NOT NULL DEFAULT 0,
  internal_mean numeric(5, 2) NOT NULL DEFAULT 0,
  below_40 int NOT NULL DEFAULT 0,
  co_internal jsonb NOT NULL DEFAULT '{}'::jsonb,
  co_overall jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_pct numeric(5, 2) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE class_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON class_items, class_answer_keys, class_responses, course_notes, course_snapshots FROM anon;

CREATE POLICY class_items_read ON class_items
  FOR SELECT TO authenticated
  USING (can_read_course(course_id));

CREATE POLICY class_items_write ON class_items
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY class_answer_keys_faculty ON class_answer_keys
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM class_items ci WHERE ci.id = class_answer_keys.item_id AND is_course_faculty(ci.course_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM class_items ci WHERE ci.id = class_answer_keys.item_id AND is_course_faculty(ci.course_id))
  );

CREATE POLICY class_responses_read ON class_responses
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR EXISTS (SELECT 1 FROM class_items ci WHERE ci.id = class_responses.item_id AND is_course_faculty(ci.course_id))
  );

CREATE POLICY course_notes_read ON course_notes
  FOR SELECT TO authenticated
  USING (is_course_faculty(course_id) OR can_oversee_course(course_id));

CREATE POLICY course_notes_write ON course_notes
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY course_snapshots_read ON course_snapshots
  FOR SELECT TO authenticated
  USING (is_course_faculty(course_id) OR can_oversee_course(course_id));

CREATE POLICY course_snapshots_write ON course_snapshots
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

-- Private storage bucket class-files (Supabase only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('class-files', 'class-files', false, 20971520)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Workflows
CREATE OR REPLACE FUNCTION submit_class_response(
  p_item_id uuid,
  p_answer jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item class_items%ROWTYPE;
  v_key jsonb;
  v_score int := 1;
BEGIN
  SELECT * INTO v_item FROM class_items WHERE id = p_item_id;
  IF NOT FOUND OR NOT is_course_student(v_item.course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT answer INTO v_key FROM class_answer_keys WHERE item_id = p_item_id;
  IF FOUND AND (v_key->>'choice') IS NOT NULL THEN
    v_score := CASE WHEN (p_answer->>'choice') = (v_key->>'choice') THEN 1 ELSE 0 END;
  END IF;

  INSERT INTO class_responses (item_id, student_id, answer, score, submitted_at)
  VALUES (p_item_id, me(), p_answer, v_score, now())
  ON CONFLICT (item_id, student_id) DO UPDATE
    SET answer = EXCLUDED.answer, score = EXCLUDED.score, submitted_at = now();

  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION submit_final_marks(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course courses%ROWTYPE;
  v_hod uuid;
BEGIN
  SELECT * INTO v_course FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_course.faculty_id <> me() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_course.final_status NOT IN ('draft', 'returned') THEN RAISE EXCEPTION 'not_pending'; END IF;

  UPDATE courses SET final_status = 'submitted' WHERE id = p_course_id;

  FOR v_hod IN
    SELECT id FROM profiles
    WHERE institution_id = v_course.institution_id
      AND department_id = v_course.department_id
      AND role = 'hod' AND active = true
  LOOP
    PERFORM notify(v_course.institution_id, v_hod, 'final_marks', v_course.code || ' final marks submitted', 'Review and recommend to CoE.', '/hod');
  END LOOP;

  PERFORM audit('submit_final_marks', 'course', p_course_id::text, jsonb_build_object('code', v_course.code), v_course.institution_id);
END;
$$;

CREATE OR REPLACE FUNCTION decide_final_marks(
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
  v_coe uuid;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = me() AND active = true;
  SELECT * INTO v_course FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF NOT p_approve AND COALESCE(trim(p_remark), '') = '' THEN
    RAISE EXCEPTION 'remark_required';
  END IF;

  IF v_course.final_status = 'submitted' THEN
    IF v_prof.role <> 'hod' OR v_prof.institution_id <> v_course.institution_id
      OR v_prof.department_id IS DISTINCT FROM v_course.department_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    UPDATE courses
    SET final_status = CASE WHEN p_approve THEN 'hod_approved' ELSE 'returned' END
    WHERE id = p_course_id;

    IF p_approve THEN
      PERFORM notify(v_course.institution_id, v_course.faculty_id, 'final_marks', v_course.code || ' final marks HOD approved', 'Recommended to CoE.', '/faculty/c/' || p_course_id::text || '/reports');
      FOR v_coe IN
        SELECT id FROM profiles WHERE institution_id = v_course.institution_id AND role = 'coe' AND active = true
      LOOP
        PERFORM notify(v_course.institution_id, v_coe, 'final_marks', v_course.code || ' ready for CoE', 'Approved by HOD.', '/oversight');
      END LOOP;
    ELSE
      PERFORM notify(v_course.institution_id, v_course.faculty_id, 'final_marks', v_course.code || ' final marks returned by HOD', p_remark, '/faculty/c/' || p_course_id::text || '/reports');
    END IF;
  ELSIF v_course.final_status = 'hod_approved' THEN
    IF v_prof.role <> 'coe' OR v_prof.institution_id <> v_course.institution_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    UPDATE courses
    SET final_status = CASE WHEN p_approve THEN 'coe_accepted' ELSE 'returned' END
    WHERE id = p_course_id;

    PERFORM notify(
      v_course.institution_id,
      v_course.faculty_id,
      'final_marks',
      v_course.code || CASE WHEN p_approve THEN ' accepted by CoE' ELSE ' returned by CoE' END,
      COALESCE(p_remark, ''),
      '/faculty/c/' || p_course_id::text || '/reports'
    );
  ELSE
    RAISE EXCEPTION 'not_pending';
  END IF;

  INSERT INTO approvals (institution_id, object_type, object_id, approver_id, decision, remark, content_hash)
  VALUES (
    v_course.institution_id,
    'final_marks',
    p_course_id,
    me(),
    CASE WHEN p_approve THEN 'approved'::approval_decision ELSE 'returned'::approval_decision END,
    NULLIF(trim(COALESCE(p_remark, '')), ''),
    md5(p_course_id::text || ':' || v_course.final_status)
  );

  PERFORM audit(
    CASE WHEN p_approve THEN 'approve_final_marks' ELSE 'return_final_marks' END,
    'course',
    p_course_id::text,
    jsonb_build_object('remark', p_remark),
    v_course.institution_id
  );
END;
$$;

-- Plan notification trigger
CREATE OR REPLACE FUNCTION notify_course_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hod uuid;
BEGIN
  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status THEN
    IF NEW.plan_status = 'sent' THEN
      FOR v_hod IN
        SELECT id FROM profiles
        WHERE institution_id = NEW.institution_id AND department_id = NEW.department_id AND role = 'hod' AND active = true
      LOOP
        PERFORM notify(NEW.institution_id, v_hod, 'course_plan', NEW.code || ' course plan awaiting approval', NEW.title, '/hod');
      END LOOP;
    ELSIF NEW.plan_status IN ('approved', 'declined') THEN
      PERFORM notify(
        NEW.institution_id,
        NEW.faculty_id,
        'course_plan',
        NEW.code || ' course plan ' || NEW.plan_status::text,
        COALESCE(NEW.plan_remark, ''),
        '/faculty/c/' || NEW.id::text || '/setup'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_course_plan
  AFTER UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION notify_course_plan_change();

-- Calendar token & events
CREATE OR REPLACE FUNCTION rotate_calendar_token()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok uuid := gen_random_uuid();
BEGIN
  UPDATE profiles SET calendar_token = v_tok WHERE id = me();
  RETURN v_tok;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_events(p_token uuid)
RETURNS TABLE (
  uid text,
  title text,
  day date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE calendar_token = p_token AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF v_prof.role IN ('faculty', 'hod') THEN
    RETURN QUERY
    SELECT s.id::text, c.code || ' S' || s.n || ': ' || s.topic, s.scheduled_date
    FROM sessions s
    JOIN courses c ON c.id = s.course_id
    WHERE c.faculty_id = v_prof.id AND s.scheduled_date IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT s.id::text, c.code || ' S' || s.n || ': ' || s.topic, s.scheduled_date
    FROM sessions s
    JOIN courses c ON c.id = s.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.student_id = v_prof.id
    WHERE s.scheduled_date IS NOT NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION calendar_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION calendar_events(uuid) TO service_role;

-- Public lab file verify (returns minimal fields only)
CREATE OR REPLACE FUNCTION verify_lab_file(
  p_course_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof profiles%ROWTYPE;
  v_course courses%ROWTYPE;
  v_att_pct int;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = p_student_id AND role = 'student';
  SELECT * INTO v_course FROM courses WHERE id = p_course_id;
  IF NOT FOUND OR v_prof.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = p_course_id AND student_id = p_student_id) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT COALESCE(
    round(100.0 * count(*) FILTER (WHERE a.state IN ('present', 'late')) / NULLIF(count(*), 0))::int,
    0
  )
  INTO v_att_pct
  FROM attendance a
  JOIN session_runs sr ON sr.id = a.session_run_id
  JOIN sessions s ON s.id = sr.session_id
  WHERE s.course_id = p_course_id AND a.student_id = p_student_id;

  RETURN jsonb_build_object(
    'full_name', v_prof.full_name,
    'roll_no', v_prof.roll_no,
    'course_code', v_course.code,
    'course_title', v_course.title,
    'attendance_pct', v_att_pct
  );
END;
$$;
