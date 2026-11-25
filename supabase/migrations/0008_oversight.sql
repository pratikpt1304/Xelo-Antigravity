-- Phase 6: Oversight statistics RPCs, at-risk detection, live labs, CoE eligibility

CREATE OR REPLACE FUNCTION course_stats(p_course_ids uuid[])
RETURNS TABLE (
  course_id uuid,
  students int,
  sessions_total int,
  sessions_conducted int,
  attendance_pct int,
  completion_pct int,
  at_risk int,
  live_now int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS course_id,
    (SELECT count(*)::int FROM enrollments e WHERE e.course_id = c.id) AS students,
    (SELECT count(*)::int FROM sessions s WHERE s.course_id = c.id) AS sessions_total,
    (SELECT count(*)::int FROM sessions s WHERE s.course_id = c.id AND s.status = 'conducted') AS sessions_conducted,
    COALESCE((
      SELECT round(100.0 * count(*) FILTER (WHERE a.state IN ('present', 'late')) / NULLIF(count(*), 0))::int
      FROM attendance a
      JOIN session_runs sr ON sr.id = a.session_run_id
      JOIN sessions s ON s.id = sr.session_id
      WHERE s.course_id = c.id
    ), 0) AS attendance_pct,
    COALESCE((
      SELECT round(100.0 * count(*) FILTER (WHERE passed_all) / NULLIF(count(*), 0))::int
      FROM (
        SELECT
          e.student_id,
          s.id AS session_id,
          (
            EXISTS (SELECT 1 FROM session_questions sq WHERE sq.session_id = s.id)
            AND NOT EXISTS (
              SELECT 1 FROM session_questions sq
              WHERE sq.session_id = s.id
                AND NOT EXISTS (
                  SELECT 1 FROM submissions sub
                  WHERE sub.session_id = s.id
                    AND sub.question_id = sq.question_id
                    AND sub.student_id = e.student_id
                    AND sub.hidden_total > 0
                    AND sub.hidden_passed = sub.hidden_total
                )
            )
          ) AS passed_all
        FROM enrollments e
        CROSS JOIN sessions s
        WHERE e.course_id = c.id AND s.course_id = c.id AND s.status = 'conducted'
      ) pairs
    ), 0) AS completion_pct,
    CASE
      WHEN (SELECT count(*) FROM sessions s WHERE s.course_id = c.id AND s.status = 'conducted') < 2 THEN 0
      ELSE COALESCE((
        SELECT count(*)::int
        FROM enrollments e
        JOIN institutions i ON i.id = c.institution_id
        WHERE e.course_id = c.id
          AND (
            COALESCE((
              SELECT round(100.0 * count(*) FILTER (WHERE a.state IN ('present', 'late')) / NULLIF(count(*), 0))
              FROM attendance a
              JOIN session_runs sr ON sr.id = a.session_run_id
              JOIN sessions s ON s.id = sr.session_id
              WHERE s.course_id = c.id AND a.student_id = e.student_id
            ), 0) < i.min_attendance_pct
            OR COALESCE((
              SELECT round(100.0 * count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM session_questions sq
                WHERE sq.session_id = s.id
                  AND EXISTS (
                    SELECT 1 FROM submissions sub
                    WHERE sub.session_id = s.id AND sub.question_id = sq.question_id AND sub.student_id = e.student_id
                      AND sub.hidden_total > 0 AND sub.hidden_passed = sub.hidden_total
                  )
              )) / NULLIF(count(*), 0))
              FROM sessions s
              WHERE s.course_id = c.id AND s.status = 'conducted'
            ), 0) < 50
          )
      ), 0)
    END AS at_risk,
    (
      SELECT count(*)::int
      FROM session_runs sr
      JOIN sessions s ON s.id = sr.session_id
      WHERE s.course_id = c.id AND sr.attendance_done = true AND sr.ended_at IS NULL
    ) AS live_now
  FROM courses c
  WHERE c.id = ANY(p_course_ids)
    AND (can_read_course(c.id) OR is_super_admin());
END;
$$;

CREATE OR REPLACE FUNCTION at_risk_students(p_course_ids uuid[])
RETURNS TABLE (
  student_id uuid,
  roll_no text,
  full_name text,
  course_id uuid,
  code text,
  reason text,
  attendance_pct int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF my_role() IN ('hod', 'dean', 'coe', 'vc') THEN
    PERFORM audit('bulk_read_at_risk', 'course_list', NULL, jsonb_build_object('count', COALESCE(array_length(p_course_ids, 1), 0)));
  END IF;

  RETURN QUERY
  SELECT
    p.id AS student_id,
    p.roll_no,
    p.full_name,
    c.id AS course_id,
    c.code,
    'Attendance below minimum'::text AS reason,
    COALESCE((
      SELECT round(100.0 * count(*) FILTER (WHERE a.state IN ('present', 'late')) / NULLIF(count(*), 0))::int
      FROM attendance a
      JOIN session_runs sr ON sr.id = a.session_run_id
      JOIN sessions s ON s.id = sr.session_id
      WHERE s.course_id = c.id AND a.student_id = p.id
    ), 0) AS attendance_pct
  FROM enrollments e
  JOIN courses c ON c.id = e.course_id
  JOIN institutions i ON i.id = c.institution_id
  JOIN profiles p ON p.id = e.student_id
  WHERE c.id = ANY(p_course_ids)
    AND (can_read_course(c.id) OR is_super_admin())
    AND (SELECT count(*) FROM sessions s WHERE s.course_id = c.id AND s.status = 'conducted') >= 2
    AND COALESCE((
      SELECT round(100.0 * count(*) FILTER (WHERE a.state IN ('present', 'late')) / NULLIF(count(*), 0))
      FROM attendance a
      JOIN session_runs sr ON sr.id = a.session_run_id
      JOIN sessions s ON s.id = sr.session_id
      WHERE s.course_id = c.id AND a.student_id = p.id
    ), 0) < i.min_attendance_pct;
END;
$$;

CREATE OR REPLACE FUNCTION live_lab_stats(p_course_ids uuid[])
RETURNS TABLE (
  run_id uuid,
  course_id uuid,
  course_code text,
  batch_name text,
  room text,
  slot text,
  session_n int,
  topic text,
  started_at timestamptz,
  ended_at timestamptz,
  enrolled int,
  present int,
  pre_done int,
  passed int,
  struggling int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.id AS run_id,
    c.id AS course_id,
    c.code AS course_code,
    b.name AS batch_name,
    b.room,
    b.slot,
    s.n AS session_n,
    s.topic,
    sr.started_at,
    sr.ended_at,
    (SELECT count(*)::int FROM enrollments e WHERE e.batch_id = b.id) AS enrolled,
    (SELECT count(*)::int FROM attendance a WHERE a.session_run_id = sr.id AND a.state IN ('present', 'late')) AS present,
    (SELECT count(*)::int FROM test_attempts ta WHERE ta.session_id = s.id AND ta.bank = 'pre' AND ta.submitted_at IS NOT NULL) AS pre_done,
    (SELECT count(DISTINCT sub.student_id)::int FROM submissions sub WHERE sub.session_id = s.id AND sub.hidden_total > 0 AND sub.hidden_passed = sub.hidden_total) AS passed,
    0 AS struggling
  FROM session_runs sr
  JOIN sessions s ON s.id = sr.session_id
  JOIN courses c ON c.id = s.course_id
  JOIN batches b ON b.id = sr.batch_id
  WHERE c.id = ANY(p_course_ids)
    AND (can_read_course(c.id) OR is_super_admin())
    AND sr.attendance_done = true
    AND sr.ended_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION set_min_attendance(p_pct int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF my_role() NOT IN ('coe', 'vc') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_pct < 0 OR p_pct > 100 THEN
    RAISE EXCEPTION 'invalid_pct';
  END IF;

  UPDATE institutions
  SET min_attendance_pct = p_pct
  WHERE id = my_institution();

  PERFORM audit('set_min_attendance', 'institution', my_institution()::text, jsonb_build_object('min_attendance_pct', p_pct));
END;
$$;
