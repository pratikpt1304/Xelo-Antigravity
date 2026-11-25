-- Phase 4: Lab runs, attendance, pre/post tests, drafts, viva, check-ins, flags, notifications

CREATE TYPE attendance_state AS ENUM ('present', 'late', 'absent');
CREATE TYPE flag_kind AS ENUM ('slow', 'fast');

CREATE TABLE session_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  started_at timestamptz,
  ended_at timestamptz,
  attendance_done boolean NOT NULL DEFAULT false,
  post_close timestamptz,
  remark text,
  UNIQUE (session_id, batch_id)
);

CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_run_id uuid REFERENCES session_runs(id) ON DELETE CASCADE,
  assessment_id uuid,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state attendance_state NOT NULL,
  marked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_run_id, student_id)
);

CREATE TABLE test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank bank_kind NOT NULL,
  item_ids uuid[] NOT NULL DEFAULT '{}',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (session_id, student_id, bank)
);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS session_run_id uuid REFERENCES session_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paper_id uuid,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'submit',
  ADD COLUMN IF NOT EXISTS marks int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verdict text;

CREATE TABLE drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  context text NOT NULL DEFAULT 'lab' CHECK (context IN ('lab', 'exam')),
  lang text NOT NULL,
  code text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, question_id, context, lang)
);

CREATE TABLE viva (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  assessment_id uuid,
  marks int NOT NULL CHECK (marks >= 0),
  examiner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);

CREATE TABLE lab_checkins (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE course_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind flag_kind NOT NULL,
  note text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id, kind)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE session_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE viva ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON session_runs, attendance, test_attempts, drafts, viva, lab_checkins, course_flags, notifications FROM anon;

CREATE POLICY session_runs_read ON session_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_runs.session_id AND can_read_course(s.course_id))
  );

CREATE POLICY attendance_read ON attendance
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR EXISTS (
      SELECT 1 FROM session_runs sr
      JOIN sessions s ON s.id = sr.session_id
      WHERE sr.id = attendance.session_run_id
        AND (is_course_faculty(s.course_id) OR can_oversee_course(s.course_id))
    )
  );

CREATE POLICY test_attempts_read ON test_attempts
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = test_attempts.session_id
        AND (is_course_faculty(s.course_id) OR can_oversee_course(s.course_id))
    )
  );

CREATE POLICY drafts_self ON drafts
  FOR ALL TO authenticated
  USING (student_id = me())
  WITH CHECK (student_id = me());

CREATE POLICY viva_read ON viva
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = viva.session_id
        AND (is_course_faculty(s.course_id) OR can_oversee_course(s.course_id))
    )
  );

CREATE POLICY lab_checkins_read ON lab_checkins
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = lab_checkins.session_id
        AND (is_course_faculty(s.course_id) OR can_oversee_course(s.course_id))
    )
  );

CREATE POLICY course_flags_read ON course_flags
  FOR SELECT TO authenticated
  USING (is_course_faculty(course_id) OR can_oversee_course(course_id));

CREATE POLICY course_flags_write ON course_flags
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY notifications_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = me());

CREATE POLICY notifications_update_self ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = me())
  WITH CHECK (user_id = me());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE submissions, notifications;
  END IF;
END $$;

-- Helpers & Workflows
CREATE OR REPLACE FUNCTION notify(
  p_institution_id uuid,
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text DEFAULT '',
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (institution_id, user_id, kind, title, body, link)
  VALUES (p_institution_id, p_user_id, p_kind, p_title, COALESCE(p_body, ''), p_link);
END;
$$;

CREATE OR REPLACE FUNCTION start_session_run(
  p_session_id uuid,
  p_batch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_id uuid;
BEGIN
  SELECT course_id INTO v_course_id FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO session_runs (session_id, batch_id)
  VALUES (p_session_id, p_batch_id)
  ON CONFLICT (session_id, batch_id) DO NOTHING;

  SELECT id INTO v_id FROM session_runs WHERE session_id = p_session_id AND batch_id = p_batch_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION lab_checkin(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
BEGIN
  SELECT course_id INTO v_course_id FROM sessions WHERE id = p_session_id;
  IF NOT FOUND OR NOT is_course_student(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO lab_checkins (session_id, student_id, first_at, last_at)
  VALUES (p_session_id, me(), now(), now())
  ON CONFLICT (session_id, student_id) DO UPDATE SET last_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION suggest_attendance(p_run_id uuid)
RETURNS TABLE (student_id uuid, state attendance_state)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run session_runs%ROWTYPE;
  v_course_id uuid;
BEGIN
  SELECT * INTO v_run FROM session_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  SELECT course_id INTO v_course_id FROM sessions WHERE id = v_run.session_id;
  IF NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT e.student_id,
    CASE
      WHEN lc.last_at IS NOT NULL AND lc.last_at >= (now() - interval '3 hours') THEN 'present'::attendance_state
      ELSE 'absent'::attendance_state
    END AS state
  FROM enrollments e
  LEFT JOIN lab_checkins lc ON lc.session_id = v_run.session_id AND lc.student_id = e.student_id
  WHERE e.batch_id = v_run.batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_attendance(
  p_run_id uuid,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run session_runs%ROWTYPE;
  v_course_id uuid;
  v_entry jsonb;
  v_sid uuid;
  v_state attendance_state;
  v_post_close timestamptz;
BEGIN
  SELECT * INTO v_run FROM session_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  SELECT course_id INTO v_course_id FROM sessions WHERE id = v_run.session_id;
  IF NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_sid := (v_entry->>'student_id')::uuid;
    v_state := (v_entry->>'state')::attendance_state;

    IF NOT EXISTS (SELECT 1 FROM enrollments WHERE batch_id = v_run.batch_id AND student_id = v_sid) THEN
      RAISE EXCEPTION 'student_not_in_batch';
    END IF;

    INSERT INTO attendance (session_run_id, student_id, state, marked_by, marked_at)
    VALUES (p_run_id, v_sid, v_state, me(), now())
    ON CONFLICT (session_run_id, student_id) DO UPDATE
      SET state = EXCLUDED.state, marked_by = me(), marked_at = now();
  END LOOP;

  v_post_close := ((date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '23 hours 59 minutes') AT TIME ZONE 'Asia/Kolkata');

  UPDATE session_runs
  SET attendance_done = true,
      started_at = COALESCE(started_at, now()),
      post_close = COALESCE(post_close, v_post_close)
  WHERE id = p_run_id;

  UPDATE sessions SET status = 'conducted' WHERE id = v_run.session_id;
  PERFORM audit('save_attendance', 'session_run', p_run_id::text, jsonb_build_object('count', jsonb_array_length(p_entries)));
END;
$$;

CREATE OR REPLACE FUNCTION start_test(
  p_session_id uuid,
  p_bank bank_kind
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess sessions%ROWTYPE;
  v_batch_id uuid;
  v_run session_runs%ROWTYPE;
  v_existing test_attempts%ROWTYPE;
  v_items jsonb;
  v_ids uuid[];
  v_q_count int;
  v_passed_q int;
BEGIN
  SELECT * INTO v_sess FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT batch_id INTO v_batch_id FROM enrollments WHERE course_id = v_sess.course_id AND student_id = me();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_existing FROM test_attempts WHERE session_id = p_session_id AND student_id = me() AND bank = p_bank;
  IF FOUND THEN
    IF v_existing.submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_submitted';
    END IF;
    SELECT jsonb_agg(jsonb_build_object('id', bi.id, 'level', bi.level, 'stem', bi.stem, 'options', bi.options))
    INTO v_items
    FROM bank_items bi
    WHERE bi.id = ANY(v_existing.item_ids);
    RETURN jsonb_build_object('attempt_id', v_existing.id, 'items', COALESCE(v_items, '[]'::jsonb));
  END IF;

  SELECT * INTO v_run FROM session_runs WHERE session_id = p_session_id AND batch_id = v_batch_id;

  IF p_bank = 'pre' THEN
    IF v_sess.status NOT IN ('active', 'conducted') THEN
      RAISE EXCEPTION 'test_closed';
    END IF;
    IF v_run.id IS NOT NULL AND v_run.attendance_done THEN
      RAISE EXCEPTION 'test_closed';
    END IF;

    SELECT array_agg(id) INTO v_ids FROM (
      (SELECT id FROM bank_items WHERE session_id = p_session_id AND bank = 'pre' AND approved AND level = 'easy' ORDER BY random() LIMIT 2)
      UNION ALL
      (SELECT id FROM bank_items WHERE session_id = p_session_id AND bank = 'pre' AND approved AND level = 'medium' ORDER BY random() LIMIT 2)
      UNION ALL
      (SELECT id FROM bank_items WHERE session_id = p_session_id AND bank = 'pre' AND approved AND level = 'hard' ORDER BY random() LIMIT 1)
    ) sub;
  ELSE
    IF v_run.id IS NULL OR NOT v_run.attendance_done THEN
      RAISE EXCEPTION 'post_locked';
    END IF;
    IF v_run.post_close IS NOT NULL AND now() > v_run.post_close THEN
      RAISE EXCEPTION 'test_closed';
    END IF;

    SELECT count(*)::int INTO v_q_count FROM session_questions WHERE session_id = p_session_id;
    SELECT count(DISTINCT sq.question_id)::int INTO v_passed_q
    FROM session_questions sq
    JOIN submissions s ON s.question_id = sq.question_id AND s.student_id = me() AND s.session_id = p_session_id
    WHERE sq.session_id = p_session_id AND s.hidden_total > 0 AND s.hidden_passed = s.hidden_total;

    IF v_q_count = 0 OR v_passed_q < v_q_count THEN
      RAISE EXCEPTION 'post_locked';
    END IF;

    SELECT array_agg(id) INTO v_ids FROM (
      (SELECT id FROM bank_items WHERE session_id = p_session_id AND bank = 'post' AND approved AND level = 'easy' ORDER BY random() LIMIT 1)
      UNION ALL
      (SELECT id FROM bank_items WHERE session_id = p_session_id AND bank = 'post' AND approved AND level = 'medium' ORDER BY random() LIMIT 2)
      UNION ALL
      (SELECT id FROM bank_items WHERE session_id = p_session_id AND bank = 'post' AND approved AND level = 'hard' ORDER BY random() LIMIT 2)
    ) sub;
  END IF;

  INSERT INTO test_attempts (session_id, student_id, bank, item_ids)
  VALUES (p_session_id, me(), p_bank, COALESCE(v_ids, '{}'))
  RETURNING * INTO v_existing;

  SELECT jsonb_agg(jsonb_build_object('id', bi.id, 'level', bi.level, 'stem', bi.stem, 'options', bi.options))
  INTO v_items
  FROM bank_items bi
  WHERE bi.id = ANY(v_existing.item_ids);

  RETURN jsonb_build_object('attempt_id', v_existing.id, 'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION submit_test(
  p_attempt_id uuid,
  p_answers jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att test_attempts%ROWTYPE;
  v_score int := 0;
  v_id uuid;
  v_ans int;
BEGIN
  SELECT * INTO v_att FROM test_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_att.student_id <> me() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_att.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  FOREACH v_id IN ARRAY v_att.item_ids LOOP
    SELECT answer INTO v_ans FROM bank_items WHERE id = v_id;
    IF (p_answers->>(v_id::text)) IS NOT NULL AND (p_answers->>(v_id::text))::int = v_ans THEN
      v_score := v_score + 1;
    END IF;
  END LOOP;

  UPDATE test_attempts
  SET answers = COALESCE(p_answers, '{}'::jsonb),
      score = v_score,
      submitted_at = now()
  WHERE id = p_attempt_id;

  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION end_session_run(
  p_run_id uuid,
  p_remark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run session_runs%ROWTYPE;
  v_course_id uuid;
BEGIN
  SELECT * INTO v_run FROM session_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  SELECT course_id INTO v_course_id FROM sessions WHERE id = v_run.session_id;
  IF NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE session_runs
  SET ended_at = now(), remark = NULLIF(trim(COALESCE(p_remark, '')), '')
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_viva(
  p_student_id uuid,
  p_session_id uuid,
  p_assessment_id uuid,
  p_marks int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_max int;
BEGIN
  SELECT s.course_id, COALESCE((c.rubric->>'viva')::int, 10)
  INTO v_course_id, v_max
  FROM sessions s
  JOIN courses c ON c.id = s.course_id
  WHERE s.id = p_session_id;

  IF NOT FOUND OR NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_marks < 0 OR p_marks > v_max THEN
    RAISE EXCEPTION 'viva_exceeds_rubric';
  END IF;

  IF EXISTS (
    SELECT 1 FROM attendance a
    JOIN session_runs sr ON sr.id = a.session_run_id
    WHERE sr.session_id = p_session_id AND a.student_id = p_student_id AND a.state = 'absent'
  ) THEN
    RAISE EXCEPTION 'absent_student';
  END IF;

  INSERT INTO viva (student_id, session_id, assessment_id, marks, examiner_id, updated_at)
  VALUES (p_student_id, p_session_id, p_assessment_id, p_marks, me(), now())
  ON CONFLICT (student_id, session_id) DO UPDATE
    SET marks = EXCLUDED.marks, examiner_id = me(), updated_at = now();

  PERFORM audit('set_viva', 'viva', p_student_id::text, jsonb_build_object('session_id', p_session_id, 'marks', p_marks));
END;
$$;

CREATE OR REPLACE FUNCTION send_hint(
  p_run_id uuid,
  p_student_ids uuid[],
  p_text text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run session_runs%ROWTYPE;
  v_course courses%ROWTYPE;
  v_sid uuid;
  v_sent int := 0;
BEGIN
  SELECT * INTO v_run FROM session_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  SELECT c.* INTO v_course FROM courses c JOIN sessions s ON s.course_id = c.id WHERE s.id = v_run.session_id;
  IF v_course.faculty_id <> me() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOREACH v_sid IN ARRAY p_student_ids LOOP
    IF EXISTS (SELECT 1 FROM enrollments WHERE batch_id = v_run.batch_id AND student_id = v_sid) THEN
      PERFORM notify(
        v_course.institution_id,
        v_sid,
        'hint',
        'Hint from faculty',
        p_text,
        '/student/lab/' || v_run.session_id::text
      );
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;
