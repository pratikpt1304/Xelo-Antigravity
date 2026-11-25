-- Phase 1: Workflows and sign-up gate

CREATE OR REPLACE FUNCTION audit(
  p_action text,
  p_object_type text,
  p_object_id text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_institution_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (institution_id, actor_id, action, object_type, object_id, detail)
  VALUES (
    COALESCE(p_institution_id, my_institution()),
    me(),
    p_action,
    p_object_type,
    p_object_id,
    COALESCE(p_detail, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invites%ROWTYPE;
  v_domain text;
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
    id,
    institution_id,
    email,
    full_name,
    role,
    school_id,
    department_id,
    roll_no,
    active
  ) VALUES (
    NEW.id,
    v_inv.institution_id,
    lower(NEW.email),
    v_inv.full_name,
    v_inv.role,
    v_inv.school_id,
    v_inv.department_id,
    v_inv.roll_no,
    true
  );

  UPDATE invites
  SET accepted_at = now()
  WHERE id = v_inv.id;

  INSERT INTO audit_log (institution_id, actor_id, action, object_type, object_id, detail)
  VALUES (
    v_inv.institution_id,
    NEW.id,
    'sign_up',
    'profile',
    NEW.id::text,
    jsonb_build_object('email', lower(NEW.email), 'role', v_inv.role)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auth_users_after_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION admin_create_institution(
  p_name text,
  p_email_domain text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_dom text := lower(trim(p_email_domain));
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO institutions (name, email_domain)
  VALUES (trim(p_name), v_dom)
  RETURNING id INTO v_id;

  PERFORM audit('create_institution', 'institution', v_id::text, jsonb_build_object('name', trim(p_name), 'domain', v_dom), v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_school(
  p_institution_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO schools (institution_id, name)
  VALUES (p_institution_id, trim(p_name))
  RETURNING id INTO v_id;

  PERFORM audit('create_school', 'school', v_id::text, jsonb_build_object('name', trim(p_name)), p_institution_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_department(
  p_institution_id uuid,
  p_school_id uuid,
  p_code text,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO departments (institution_id, school_id, code, name)
  VALUES (p_institution_id, p_school_id, upper(trim(p_code)), trim(p_name))
  RETURNING id INTO v_id;

  PERFORM audit('create_department', 'department', v_id::text, jsonb_build_object('code', upper(trim(p_code)), 'name', trim(p_name)), p_institution_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_invite(
  p_email text,
  p_role app_role,
  p_full_name text,
  p_institution_id uuid,
  p_school_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_email text := lower(trim(p_email));
  v_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email_domain INTO v_domain
  FROM institutions
  WHERE id = p_institution_id;

  IF v_domain IS NULL OR email_domain(v_email) <> lower(v_domain) THEN
    RAISE EXCEPTION 'domain_mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'already_invited';
  END IF;

  INSERT INTO invites (
    institution_id, email, role, full_name, school_id, department_id, created_by
  ) VALUES (
    p_institution_id, v_email, p_role, trim(p_full_name), p_school_id, p_department_id, me()
  )
  RETURNING id INTO v_id;

  PERFORM audit('admin_invite', 'invite', v_id::text, jsonb_build_object('email', v_email, 'role', p_role), p_institution_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_active(
  p_user_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_email text;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE profiles
  SET active = p_active
  WHERE id = p_user_id
  RETURNING institution_id, email INTO v_inst, v_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  PERFORM audit(
    CASE WHEN p_active THEN 'reactivate_user' ELSE 'deactivate_user' END,
    'profile',
    p_user_id::text,
    jsonb_build_object('email', v_email, 'active', p_active),
    v_inst
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_plan(
  p_tier plan_tier,
  p_total_cap int,
  p_daily_cap int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_total_cap < 0 OR p_daily_cap < 1 THEN
    RAISE EXCEPTION 'invalid_cap';
  END IF;

  UPDATE plans
  SET total_cap = p_total_cap,
      daily_cap = p_daily_cap,
      updated_at = now()
  WHERE tier = p_tier;

  PERFORM audit('update_plan', 'plan', p_tier::text, jsonb_build_object('total_cap', p_total_cap, 'daily_cap', p_daily_cap));
END;
$$;

CREATE OR REPLACE FUNCTION admin_switch_institution_plan(
  p_institution_id uuid,
  p_tier plan_tier
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE institutions
  SET plan = p_tier
  WHERE id = p_institution_id;

  PERFORM audit('switch_plan', 'institution', p_institution_id::text, jsonb_build_object('plan', p_tier), p_institution_id);
END;
$$;

CREATE OR REPLACE FUNCTION create_subscription_request(
  p_institution_id uuid,
  p_plan plan_tier,
  p_start_date date,
  p_months int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_super_admin() AND NOT (my_institution() = p_institution_id AND my_role() IN ('vc', 'coe', 'dean', 'hod')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO subscription_requests (institution_id, requested_by, plan, start_date, months)
  VALUES (p_institution_id, me(), p_plan, p_start_date, p_months)
  RETURNING id INTO v_id;

  PERFORM audit('create_subscription_request', 'subscription_request', v_id::text, jsonb_build_object('plan', p_plan, 'months', p_months), p_institution_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION decide_subscription(
  p_request_id uuid,
  p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req subscription_requests%ROWTYPE;
  v_end date;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_req
  FROM subscription_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_req.status <> 'sent'::sub_req_status THEN
    RAISE EXCEPTION 'not_pending';
  END IF;

  IF p_approve THEN
    v_end := (v_req.start_date + (v_req.months || ' months')::interval - interval '1 day')::date;

    UPDATE subscription_requests
    SET status = 'approved', decided_by = me(), decided_at = now()
    WHERE id = p_request_id;

    UPDATE institutions
    SET plan = v_req.plan, plan_start = v_req.start_date, plan_end = v_end
    WHERE id = v_req.institution_id;

    PERFORM audit('approve_subscription', 'subscription_request', p_request_id::text, jsonb_build_object('plan', v_req.plan, 'plan_end', v_end), v_req.institution_id);
  ELSE
    UPDATE subscription_requests
    SET status = 'rejected', decided_by = me(), decided_at = now()
    WHERE id = p_request_id;

    PERFORM audit('reject_subscription', 'subscription_request', p_request_id::text, jsonb_build_object('plan', v_req.plan), v_req.institution_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof profiles%ROWTYPE;
  v_inst institutions%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_today_start timestamptz;
  v_used_total int;
  v_used_today int;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = me() AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_inst FROM institutions WHERE id = v_prof.institution_id;
  IF NOT FOUND OR v_inst.plan IS NULL THEN
    RETURN jsonb_build_object('plan', null, 'total_cap', 0, 'daily_cap', 0, 'used_total', 0, 'used_today', 0, 'plan_end', null);
  END IF;

  SELECT * INTO v_plan FROM plans WHERE tier = v_inst.plan;
  v_today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';

  SELECT count(*)::int INTO v_used_total
  FROM ai_runs
  WHERE user_id = me()
    AND charged = true
    AND (v_inst.plan_start IS NULL OR at >= v_inst.plan_start::timestamptz);

  SELECT count(*)::int INTO v_used_today
  FROM ai_runs
  WHERE user_id = me()
    AND charged = true
    AND at >= v_today_start;

  RETURN jsonb_build_object(
    'plan', v_inst.plan,
    'total_cap', v_plan.total_cap,
    'daily_cap', v_plan.daily_cap,
    'used_total', v_used_total,
    'used_today', v_used_today,
    'plan_end', v_inst.plan_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION consume_ai_credit(
  p_feature text,
  p_course_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof profiles%ROWTYPE;
  v_inst institutions%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_today_ist date;
  v_today_start timestamptz;
  v_used_total int;
  v_used_today int;
  v_run_id uuid;
BEGIN
  SELECT * INTO v_prof FROM profiles WHERE id = me() AND active = true;
  IF NOT FOUND OR v_prof.role NOT IN ('faculty', 'hod', 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_inst FROM institutions WHERE id = v_prof.institution_id;
  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF NOT FOUND OR v_inst.plan IS NULL OR (v_inst.plan_end IS NOT NULL AND v_inst.plan_end < v_today_ist) THEN
    RAISE EXCEPTION 'no_plan';
  END IF;

  SELECT * INTO v_plan FROM plans WHERE tier = v_inst.plan;
  v_today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';

  SELECT count(*)::int INTO v_used_today
  FROM ai_runs
  WHERE user_id = me()
    AND charged = true
    AND at >= v_today_start;

  IF v_used_today >= v_plan.daily_cap THEN
    RAISE EXCEPTION 'daily_cap';
  END IF;

  SELECT count(*)::int INTO v_used_total
  FROM ai_runs
  WHERE user_id = me()
    AND charged = true
    AND (v_inst.plan_start IS NULL OR at >= v_inst.plan_start::timestamptz);

  IF v_used_total >= v_plan.total_cap THEN
    RAISE EXCEPTION 'total_cap';
  END IF;

  INSERT INTO ai_runs (institution_id, user_id, feature, course_id, status, charged)
  VALUES (v_inst.id, me(), p_feature, p_course_id, 'completed', true)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION refund_ai_credit(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_api_user() AND NOT is_super_admin() THEN
    -- Only owner (e.g. edge function user context on invalid output) or super_admin can refund their own run
    UPDATE ai_runs
    SET charged = false, status = 'refunded'
    WHERE id = p_run_id AND user_id = me();
  ELSE
    UPDATE ai_runs
    SET charged = false, status = 'refunded'
    WHERE id = p_run_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ai_usage_report()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  institution_id uuid,
  institution_name text,
  plan plan_tier,
  plan_end date,
  total_cap int,
  daily_cap int,
  used_total int,
  used_today int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    i.id AS institution_id,
    i.name AS institution_name,
    i.plan,
    i.plan_end,
    COALESCE(pl.total_cap, 0) AS total_cap,
    COALESCE(pl.daily_cap, 0) AS daily_cap,
    COALESCE((
      SELECT count(*)::int FROM ai_runs r
      WHERE r.user_id = p.id AND r.charged = true
        AND (i.plan_start IS NULL OR r.at >= i.plan_start::timestamptz)
    ), 0) AS used_total,
    COALESCE((
      SELECT count(*)::int FROM ai_runs r
      WHERE r.user_id = p.id AND r.charged = true AND r.at >= v_today_start
    ), 0) AS used_today
  FROM profiles p
  JOIN institutions i ON i.id = p.institution_id
  LEFT JOIN plans pl ON pl.tier = i.plan
  WHERE p.role IN ('faculty', 'hod')
  ORDER BY i.name, p.full_name;
END;
$$;
