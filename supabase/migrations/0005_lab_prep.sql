-- Phase 3: Lab questions, test cases, reference solutions, pre/post banks, submissions

CREATE TYPE question_kind AS ENUM ('lab', 'endsem', 'task');
CREATE TYPE question_status AS ENUM ('candidate', 'approved', 'rejected');
CREATE TYPE question_source AS ENUM ('ai', 'faculty');
CREATE TYPE bank_kind AS ENUM ('pre', 'post');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind question_kind NOT NULL DEFAULT 'lab',
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  assessment_id uuid,
  co_code text NOT NULL DEFAULT 'CO1',
  difficulty difficulty_level NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  statement text NOT NULL,
  input_spec text NOT NULL DEFAULT '',
  output_spec text NOT NULL DEFAULT '',
  constraints text NOT NULL DEFAULT '',
  status question_status NOT NULL DEFAULT 'candidate',
  source question_source NOT NULL DEFAULT 'ai',
  valid boolean NOT NULL DEFAULT false,
  validation_note text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  ord int NOT NULL DEFAULT 1,
  input text NOT NULL DEFAULT '',
  expected text NOT NULL DEFAULT '',
  hidden boolean NOT NULL DEFAULT false,
  marks int NOT NULL DEFAULT 5
);

CREATE TABLE reference_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  lang text NOT NULL,
  code text NOT NULL,
  UNIQUE (question_id, lang)
);

CREATE TABLE session_questions (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  slot int NOT NULL CHECK (slot IN (1, 2)),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, slot)
);

CREATE TABLE bank_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  bank bank_kind NOT NULL,
  level difficulty_level NOT NULL,
  stem text NOT NULL,
  options jsonb NOT NULL CHECK (jsonb_array_length(options) BETWEEN 2 AND 6),
  answer int NOT NULL CHECK (answer >= 0),
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  context text NOT NULL DEFAULT 'lab' CHECK (context IN ('lab', 'exam')),
  lang text NOT NULL,
  code text NOT NULL,
  visible_passed int NOT NULL DEFAULT 0,
  visible_total int NOT NULL DEFAULT 0,
  hidden_passed int NOT NULL DEFAULT 0,
  hidden_total int NOT NULL DEFAULT 0,
  runtime_ms int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpers
CREATE OR REPLACE FUNCTION student_can_see_question(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM questions q
    JOIN sessions s ON s.id = q.session_id
    WHERE q.id = p_question_id
      AND s.status IN ('active', 'conducted')
      AND is_course_student(q.course_id)
  );
$$;

-- RLS
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON questions, test_cases, reference_solutions, session_questions, bank_items, submissions FROM anon;

CREATE POLICY questions_read ON questions
  FOR SELECT TO authenticated
  USING (
    is_course_faculty(course_id)
    OR can_oversee_course(course_id)
    OR student_can_see_question(id)
  );

CREATE POLICY questions_write ON questions
  FOR ALL TO authenticated
  USING (is_course_faculty(course_id))
  WITH CHECK (is_course_faculty(course_id));

CREATE POLICY test_cases_read ON test_cases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = test_cases.question_id
        AND (
          is_course_faculty(q.course_id)
          OR can_oversee_course(q.course_id)
          OR (test_cases.hidden = false AND student_can_see_question(q.id))
        )
    )
  );

CREATE POLICY test_cases_write ON test_cases
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM questions q WHERE q.id = test_cases.question_id AND is_course_faculty(q.course_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM questions q WHERE q.id = test_cases.question_id AND is_course_faculty(q.course_id))
  );

CREATE POLICY reference_solutions_read ON reference_solutions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = reference_solutions.question_id
        AND (is_course_faculty(q.course_id) OR can_oversee_course(q.course_id))
    )
  );

CREATE POLICY reference_solutions_write ON reference_solutions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM questions q WHERE q.id = reference_solutions.question_id AND is_course_faculty(q.course_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM questions q WHERE q.id = reference_solutions.question_id AND is_course_faculty(q.course_id))
  );

CREATE POLICY session_questions_read ON session_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_questions.session_id AND can_read_course(s.course_id))
  );

CREATE POLICY bank_items_read ON bank_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = bank_items.session_id
        AND (is_course_faculty(s.course_id) OR can_oversee_course(s.course_id))
    )
  );

CREATE POLICY bank_items_write ON bank_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = bank_items.session_id AND is_course_faculty(s.course_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = bank_items.session_id AND is_course_faculty(s.course_id))
  );

CREATE POLICY submissions_read ON submissions
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR is_course_faculty(course_id)
    OR can_oversee_course(course_id)
  );

-- Column guards
CREATE OR REPLACE FUNCTION guard_questions_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.valid IS DISTINCT FROM OLD.valid
      OR NEW.validation_note IS DISTINCT FROM OLD.validation_note THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_questions_update
  BEFORE UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION guard_questions_update();

-- RPCs & Functions
CREATE OR REPLACE FUNCTION hidden_test_counts(p_question_ids uuid[])
RETURNS TABLE (question_id uuid, hidden_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tc.question_id, count(*)::int AS hidden_count
  FROM test_cases tc
  WHERE tc.question_id = ANY(p_question_ids)
    AND tc.hidden = true
  GROUP BY tc.question_id;
$$;

CREATE OR REPLACE FUNCTION authorize_run(p_question_id uuid, p_context text)
RETURNS TABLE (
  test_case_id uuid,
  ord int,
  input text,
  expected text,
  hidden boolean,
  marks int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT tc.id, tc.ord, tc.input, tc.expected, tc.hidden, tc.marks
  FROM test_cases tc
  WHERE tc.question_id = p_question_id
  ORDER BY tc.hidden, tc.ord;
END;
$$;

REVOKE ALL ON FUNCTION authorize_run(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION authorize_run(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION refresh_session_status(p_session_id uuid)
RETURNS session_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur session_status;
  v_q_ok int;
  v_pre_ok boolean;
  v_post_ok boolean;
  v_any boolean;
  v_next session_status;
BEGIN
  SELECT status INTO v_cur FROM sessions WHERE id = p_session_id;
  IF v_cur = 'conducted' THEN
    RETURN v_cur;
  END IF;

  SELECT count(*)::int INTO v_q_ok
  FROM session_questions sq
  JOIN questions q ON q.id = sq.question_id
  WHERE sq.session_id = p_session_id
    AND q.status = 'approved'
    AND q.valid = true;

  SELECT (
    count(*) FILTER (WHERE level = 'easy' AND approved) >= 15 AND
    count(*) FILTER (WHERE level = 'medium' AND approved) >= 15 AND
    count(*) FILTER (WHERE level = 'hard' AND approved) >= 15
  ) INTO v_pre_ok
  FROM bank_items
  WHERE session_id = p_session_id AND bank = 'pre';

  SELECT (
    count(*) FILTER (WHERE level = 'easy' AND approved) >= 15 AND
    count(*) FILTER (WHERE level = 'medium' AND approved) >= 15 AND
    count(*) FILTER (WHERE level = 'hard' AND approved) >= 15
  ) INTO v_post_ok
  FROM bank_items
  WHERE session_id = p_session_id AND bank = 'post';

  IF v_q_ok = 2 AND COALESCE(v_pre_ok, false) AND COALESCE(v_post_ok, false) THEN
    v_next := 'active';
  ELSE
    SELECT (
      EXISTS (SELECT 1 FROM questions WHERE session_id = p_session_id) OR
      EXISTS (SELECT 1 FROM bank_items WHERE session_id = p_session_id)
    ) INTO v_any;
    v_next := CASE WHEN v_any THEN 'draft'::session_status ELSE 'none'::session_status END;
  END IF;

  UPDATE sessions SET status = v_next WHERE id = p_session_id;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION pick_session_questions(
  p_session_id uuid,
  p_q1 uuid,
  p_q2 uuid
)
RETURNS session_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_ok int;
BEGIN
  SELECT course_id INTO v_course_id FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_q1 = p_q2 THEN
    RAISE EXCEPTION 'duplicate_question';
  END IF;

  SELECT count(*)::int INTO v_ok
  FROM questions
  WHERE id IN (p_q1, p_q2)
    AND course_id = v_course_id
    AND valid = true;

  IF v_ok <> 2 THEN
    RAISE EXCEPTION 'invalid_question';
  END IF;

  UPDATE questions SET status = 'approved' WHERE id IN (p_q1, p_q2);

  DELETE FROM session_questions WHERE session_id = p_session_id;
  INSERT INTO session_questions (session_id, slot, question_id)
  VALUES (p_session_id, 1, p_q1), (p_session_id, 2, p_q2);

  RETURN refresh_session_status(p_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION approve_bank(
  p_session_id uuid,
  p_bank bank_kind
)
RETURNS session_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_other bank_kind := CASE WHEN p_bank = 'pre' THEN 'post'::bank_kind ELSE 'pre'::bank_kind END;
  v_e int;
  v_m int;
  v_h int;
BEGIN
  SELECT course_id INTO v_course_id FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF NOT is_course_faculty(v_course_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    count(*) FILTER (WHERE level = 'easy')::int,
    count(*) FILTER (WHERE level = 'medium')::int,
    count(*) FILTER (WHERE level = 'hard')::int
  INTO v_e, v_m, v_h
  FROM bank_items
  WHERE session_id = p_session_id AND bank = p_bank;

  IF v_e < 15 OR v_m < 15 OR v_h < 15 THEN
    RAISE EXCEPTION 'bank_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bank_items a
    JOIN bank_items b ON b.session_id = a.session_id AND b.bank = v_other
    WHERE a.session_id = p_session_id
      AND a.bank = p_bank
      AND lower(trim(a.stem)) = lower(trim(b.stem))
  ) THEN
    RAISE EXCEPTION 'bank_overlap';
  END IF;

  UPDATE bank_items
  SET approved = true
  WHERE session_id = p_session_id AND bank = p_bank;

  RETURN refresh_session_status(p_session_id);
END;
$$;
