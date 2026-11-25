-- Phase 1: Access helpers, RLS policies, and column guards

CREATE OR REPLACE FUNCTION me()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION my_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION my_institution()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(my_role() = 'super_admin'::app_role, false);
$$;

CREATE OR REPLACE FUNCTION is_api_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_user IN ('authenticated', 'anon');
$$;

CREATE OR REPLACE FUNCTION email_domain(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(split_part(trim(p_email), '@', 2));
$$;

-- Enable RLS on every table (plain RLS, never FORCE ROW LEVEL SECURITY)
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Revoke all from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Append-only audit_log
REVOKE UPDATE, DELETE ON audit_log FROM authenticated, anon;

-- Column guards (one per table)
CREATE OR REPLACE FUNCTION guard_profiles_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
      OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_profiles_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profiles_update();

CREATE OR REPLACE FUNCTION guard_institutions_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_institutions_update
  BEFORE UPDATE ON institutions
  FOR EACH ROW
  EXECUTE FUNCTION guard_institutions_update();

CREATE OR REPLACE FUNCTION guard_subscription_requests_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_api_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_subscription_requests_update
  BEFORE UPDATE ON subscription_requests
  FOR EACH ROW
  EXECUTE FUNCTION guard_subscription_requests_update();

-- Policies
CREATE POLICY profiles_read ON profiles
  FOR SELECT TO authenticated
  USING (
    id = me()
    OR is_super_admin()
    OR (
      institution_id = my_institution()
      AND my_role() IN ('vc', 'coe', 'dean', 'hod', 'faculty')
    )
  );

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE TO authenticated
  USING (id = me())
  WITH CHECK (id = me());

CREATE POLICY institutions_read ON institutions
  FOR SELECT TO authenticated
  USING (is_super_admin() OR id = my_institution());

CREATE POLICY schools_read ON schools
  FOR SELECT TO authenticated
  USING (is_super_admin() OR institution_id = my_institution());

CREATE POLICY departments_read ON departments
  FOR SELECT TO authenticated
  USING (is_super_admin() OR institution_id = my_institution());

CREATE POLICY plans_read ON plans
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY invites_read ON invites
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (institution_id = my_institution() AND my_role() IN ('hod', 'faculty'))
  );

CREATE POLICY subscription_requests_read ON subscription_requests
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (institution_id = my_institution() AND my_role() IN ('vc', 'coe', 'dean', 'hod'))
  );

CREATE POLICY ai_runs_read ON ai_runs
  FOR SELECT TO authenticated
  USING (is_super_admin() OR user_id = me());

CREATE POLICY approvals_read ON approvals
  FOR SELECT TO authenticated
  USING (is_super_admin() OR institution_id = my_institution());

CREATE POLICY audit_log_read ON audit_log
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      institution_id = my_institution()
      AND my_role() IN ('vc', 'coe', 'dean', 'hod')
    )
  );
