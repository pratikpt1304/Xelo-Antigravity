-- Phase 7: End-sem practical 6-stage state machine and proctoring

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  rules jsonb NOT NULL DEFAULT '{"questions_per_student":2,"mix":{"easy":12,"medium":16,"hard":12},"visible_count":2,"hidden_count":3,"marks_per_test":5,"viva":10,"duration_min":120}'::jsonb,
  cos text[] NOT NULL DEFAULT '{}',
  stage int NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 6),
  hod_status plan_status NOT NULL DEFAULT 'draft',
  hod_remark text,
  scheduled_at timestamptz,
  room text,
  attendance_done boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  ended_at timestamptz,
  added_to_file boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, batch_id)
);

CREATE TABLE assessment_questions (
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE exam_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  q_ids uuid[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  submitted_at timestamptz,
  flagged boolean NOT NULL DEFAULT false,
  UNIQUE (assessment_id, student_id)
);

CREATE TABLE proctor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity int NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  detail text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now(),
  snapshot_path text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz
);

ALTER TABLE attendance
  ADD CONSTRAINT attendance_assessment_student_uniq UNIQUE (assessment_id, student_id);

-- Update student_can_see_question to include active exam papers
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
  ) OR EXISTS (
    SELECT 1
    FROM exam_papers ep
    WHERE ep.student_id = auth.uid()
      AND ep.started_at IS NOT NULL
      AND p_question_id = ANY(ep.q_ids)
  );
$$;

-- RLS
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE proctor_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON assessments, assessment_questions, exam_papers, proctor_events FROM anon;

CREATE POLICY assessments_read ON assessments
  FOR SELECT TO authenticated
  USING (can_read_course(course_id));

CREATE POLICY assessment_questions_read ON assessment_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_questions.assessment_id
        AND (is_course_faculty(a.course_id) OR can_oversee_course(a.course_id))
    )
  );

CREATE POLICY exam_papers_read ON exam_papers
  FOR SELECT TO authenticated
  USING (
    student_id = me()
    OR EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = exam_papers.assessment_id
        AND (is_course_faculty(a.course_id) OR can_oversee_course(a.course_id))
    )
  );

CREATE POLICY proctor_events_read ON proctor_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_papers ep
      JOIN assessments a ON a.id = ep.assessment_id
      WHERE ep.id = proctor_events.paper_id
        AND (ep.student_id = me() OR is_course_faculty(a.course_id) OR can_oversee_course(a.course_id))
    )
  );

-- Storage bucket for proctor event snapshots (90-day retention)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('proctor', 'proctor', false, 5242880)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Workflows
CREATE OR REPLACE FUNCTION create_assessment(
  p_course_id uuid,
  p_batch_id uuid,
  p_rules jsonb,
  p_cos text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mix_total int;
  v_id uuid;
BEGIN
  IF NOT is_course_faculty(p_course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF COALESCE(array_length(p_cos, 1), 0) < 1 THEN RAISE EXCEPTION 'cos_required'; END IF;

  v_mix_total := COALESCE((p_rules->'mix'->>'easy')::int, 0)
    + COALESCE((p_rules->'mix'->>'medium')::int, 0)
    + COALESCE((p_rules->'mix'->>'hard')::int, 0);
  IF v_mix_total <> 40 THEN RAISE EXCEPTION 'mix_must_total_40'; END IF;

  INSERT INTO assessments (course_id, batch_id, rules, cos, stage)
  VALUES (p_course_id, p_batch_id, p_rules, p_cos, 1)
  ON CONFLICT (course_id, batch_id) DO UPDATE
    SET rules = EXCLUDED.rules, cos = EXCLUDED.cos
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION send_assessment_to_hod(
  p_assessment_id uuid,
  p_q_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
  v_course courses%ROWTYPE;
  v_valid_cnt int;
  v_co text;
  v_co_cnt int;
  v_hod uuid;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_course FROM courses WHERE id = v_a.course_id;
  IF v_course.faculty_id <> me() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_a.hod_status IN ('sent', 'approved') THEN RAISE EXCEPTION 'locked'; END IF;

  IF COALESCE(array_length(p_q_ids, 1), 0) <> 30 THEN
    RAISE EXCEPTION 'must_approve_30';
  END IF;

  SELECT count(*)::int INTO v_valid_cnt
  FROM assessment_questions aq
  JOIN questions q ON q.id = aq.question_id
  WHERE aq.assessment_id = p_assessment_id
    AND aq.question_id = ANY(p_q_ids)
    AND q.valid = true;

  IF v_valid_cnt <> 30 THEN
    RAISE EXCEPTION 'invalid_question';
  END IF;

  FOREACH v_co IN ARRAY v_a.cos LOOP
    SELECT count(*)::int INTO v_co_cnt
    FROM questions
    WHERE id = ANY(p_q_ids) AND co_code = v_co;
    IF v_co_cnt < 4 THEN
      RAISE EXCEPTION 'co_coverage_error';
    END IF;
  END LOOP;

  UPDATE assessment_questions SET approved = false WHERE assessment_id = p_assessment_id;
  UPDATE assessment_questions SET approved = true WHERE assessment_id = p_assessment_id AND question_id = ANY(p_q_ids);
  UPDATE assessments SET hod_status = 'sent', hod_remark = NULL, stage = 3 WHERE id = p_assessment_id;

  FOR v_hod IN
    SELECT id FROM profiles
    WHERE institution_id = v_course.institution_id AND department_id = v_course.department_id AND role = 'hod' AND active = true
  LOOP
    PERFORM notify(v_course.institution_id, v_hod, 'endsem', v_course.code || ' end-sem set awaiting approval', '30 questions selected.', '/hod');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION decide_assessment(
  p_assessment_id uuid,
  p_approve boolean,
  p_remark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
  v_course courses%ROWTYPE;
  v_prof profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = me() AND active = true;
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_course FROM courses WHERE id = v_a.course_id;

  IF v_prof.role <> 'hod' OR v_prof.institution_id <> v_course.institution_id
    OR v_prof.department_id IS DISTINCT FROM v_course.department_id
    OR v_course.faculty_id = me() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_a.hod_status <> 'sent' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT p_approve AND COALESCE(trim(p_remark), '') = '' THEN
    RAISE EXCEPTION 'remark_required';
  END IF;

  UPDATE assessments
  SET hod_status = CASE WHEN p_approve THEN 'approved'::plan_status ELSE 'declined'::plan_status END,
      hod_remark = NULLIF(trim(COALESCE(p_remark, '')), ''),
      stage = CASE WHEN p_approve THEN 4 ELSE 2 END
  WHERE id = p_assessment_id;

  INSERT INTO approvals (institution_id, object_type, object_id, approver_id, decision, remark, content_hash)
  VALUES (
    v_course.institution_id,
    'endsem_set',
    p_assessment_id,
    me(),
    CASE WHEN p_approve THEN 'approved'::approval_decision ELSE 'declined'::approval_decision END,
    NULLIF(trim(COALESCE(p_remark, '')), ''),
    md5(p_assessment_id::text || ':' || v_a.stage::text)
  );

  PERFORM notify(
    v_course.institution_id,
    v_course.faculty_id,
    'endsem',
    v_course.code || ' end-sem set ' || CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
    COALESCE(p_remark, ''),
    '/faculty/c/' || v_course.id::text || '/assessments'
  );
END;
$$;

CREATE OR REPLACE FUNCTION schedule_assessment(
  p_assessment_id uuid,
  p_at timestamptz,
  p_room text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
  v_course courses%ROWTYPE;
  v_stu uuid;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_course FROM courses WHERE id = v_a.course_id;
  IF v_course.faculty_id <> me() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_a.hod_status <> 'approved' OR v_a.stage < 4 THEN RAISE EXCEPTION 'not_approved'; END IF;

  UPDATE assessments
  SET scheduled_at = p_at, room = trim(p_room), stage = 5
  WHERE id = p_assessment_id;

  FOR v_stu IN SELECT student_id FROM enrollments WHERE batch_id = v_a.batch_id LOOP
    PERFORM notify(v_course.institution_id, v_stu, 'exam_scheduled', v_course.code || ' end-sem scheduled', trim(p_room), '/student/endsem');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION save_exam_attendance(
  p_assessment_id uuid,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
  v_entry jsonb;
  v_sid uuid;
  v_state attendance_state;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT is_course_faculty(v_a.course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_a.stage < 5 THEN RAISE EXCEPTION 'not_scheduled'; END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_sid := (v_entry->>'student_id')::uuid;
    v_state := (v_entry->>'state')::attendance_state;
    INSERT INTO attendance (assessment_id, student_id, state, marked_by, marked_at)
    VALUES (p_assessment_id, v_sid, v_state, me(), now())
    ON CONFLICT (assessment_id, student_id) DO UPDATE
      SET state = EXCLUDED.state, marked_by = me(), marked_at = now();
  END LOOP;

  UPDATE assessments SET attendance_done = true WHERE id = p_assessment_id;
END;
$$;

CREATE OR REPLACE FUNCTION activate_assessment(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT is_course_faculty(v_a.course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT v_a.attendance_done THEN RAISE EXCEPTION 'attendance_required'; END IF;

  UPDATE assessments SET activated_at = COALESCE(activated_at, now()) WHERE id = p_assessment_id;
END;
$$;

CREATE OR REPLACE FUNCTION start_exam(p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
  v_existing exam_papers%ROWTYPE;
  v_q_ids uuid[];
  v_dur int;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_a.activated_at IS NULL THEN RAISE EXCEPTION 'not_activated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM attendance
    WHERE assessment_id = p_assessment_id AND student_id = me() AND state IN ('present', 'late')
  ) THEN
    RAISE EXCEPTION 'absent_or_unmarked';
  END IF;

  SELECT * INTO v_existing FROM exam_papers WHERE assessment_id = p_assessment_id AND student_id = me();
  IF FOUND THEN
    RETURN jsonb_build_object('paper_id', v_existing.id, 'q_ids', v_existing.q_ids, 'deadline', v_existing.deadline);
  END IF;

  v_dur := COALESCE((v_a.rules->>'duration_min')::int, 120);
  v_deadline := v_a.activated_at + (v_dur || ' minutes')::interval;

  SELECT array_agg(question_id) INTO v_q_ids FROM (
    SELECT question_id FROM assessment_questions
    WHERE assessment_id = p_assessment_id AND approved = true
    ORDER BY random()
    LIMIT 2
  ) sub;

  INSERT INTO exam_papers (assessment_id, student_id, q_ids, started_at, deadline)
  VALUES (p_assessment_id, me(), COALESCE(v_q_ids, '{}'), now(), v_deadline)
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('paper_id', v_existing.id, 'q_ids', v_existing.q_ids, 'deadline', v_existing.deadline);
END;
$$;

CREATE OR REPLACE FUNCTION grant_extra_time(p_paper_id uuid, p_minutes int)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_new timestamptz;
BEGIN
  SELECT a.course_id INTO v_course_id
  FROM exam_papers ep JOIN assessments a ON a.id = ep.assessment_id
  WHERE ep.id = p_paper_id;
  IF NOT FOUND OR NOT is_course_faculty(v_course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE exam_papers
  SET deadline = deadline + (p_minutes || ' minutes')::interval
  WHERE id = p_paper_id
  RETURNING deadline INTO v_new;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION log_proctor_event(
  p_paper_id uuid,
  p_type text,
  p_severity int DEFAULT 2,
  p_detail text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ep exam_papers%ROWTYPE;
  v_warns int;
BEGIN
  SELECT * INTO v_ep FROM exam_papers WHERE id = p_paper_id;
  IF NOT FOUND OR v_ep.student_id <> me() THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO proctor_events (paper_id, type, severity, detail)
  VALUES (p_paper_id, p_type, p_severity, COALESCE(p_detail, ''));

  SELECT count(*)::int INTO v_warns FROM proctor_events WHERE paper_id = p_paper_id AND severity >= 2;
  IF v_warns >= 3 THEN
    UPDATE exam_papers SET flagged = true WHERE id = p_paper_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION submit_exam(p_paper_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE exam_papers
  SET submitted_at = COALESCE(submitted_at, now())
  WHERE id = p_paper_id AND student_id = me();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION end_assessment(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND OR NOT is_course_faculty(v_a.course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE exam_papers SET submitted_at = COALESCE(submitted_at, now()) WHERE assessment_id = p_assessment_id;
  UPDATE assessments SET ended_at = now(), stage = 6 WHERE id = p_assessment_id;
END;
$$;

CREATE OR REPLACE FUNCTION review_proctor_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
BEGIN
  SELECT a.course_id INTO v_course_id
  FROM proctor_events pe
  JOIN exam_papers ep ON ep.id = pe.paper_id
  JOIN assessments a ON a.id = ep.assessment_id
  WHERE pe.id = p_event_id;
  IF NOT FOUND OR NOT is_course_faculty(v_course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE proctor_events SET reviewed_by = me(), reviewed_at = now() WHERE id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_assessment_to_file(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assessments%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND OR NOT is_course_faculty(v_a.course_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_a.stage < 6 THEN RAISE EXCEPTION 'not_ended'; END IF;

  IF EXISTS (
    SELECT 1 FROM proctor_events pe
    JOIN exam_papers ep ON ep.id = pe.paper_id
    WHERE ep.assessment_id = p_assessment_id AND ep.flagged = true AND pe.reviewed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'unreviewed_flags';
  END IF;

  UPDATE assessments SET added_to_file = true WHERE id = p_assessment_id;
END;
$$;
