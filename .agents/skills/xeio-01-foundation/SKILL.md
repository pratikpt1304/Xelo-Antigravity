---
name: xeio-01-foundation
description: Phase 1 of the XeIO build. Organisation model, invites and sign-up gate, single sign-in page with role routing, landing page, and the super admin console (users, institutions, subscriptions, AI credits, audit). Use after phase 0 is approved.
---

# Phase 1: Foundation

**PRD:** §2, §3, §4, §8.3, §11 (institution, school, department, user, subscription_request, ai_run, audit_log). **Screens:** G1, G2, G3, A1–A5.

## 1. Schema (migration `0001_schema.sql`)

- **Organisation:**
  - `institutions`: name, email_domain (unique), plan (pro/elite/null), plan_start, plan_end, min_attendance_pct (default 75), attainment settings (threshold 60, levels 60/70/80, weights 0.4/0.6).
  - `schools`.
  - `departments` (code, name, school).
- **People:**
  - `profiles` (id = auth user id): institution, email, full_name, role enum (super_admin, vc, coe, dean, hod, faculty, student), school, department, roll_no, active, calendar_token.
  - `invites` (email, institution, role, full_name, school, department, roll_no, created_by, accepted_at).
- **Plans and AI:**
  - `plans` (tier pk, total_cap, daily_cap; seed pro 125/5 and elite 250/7).
  - `subscription_requests` (institution, plan, start_date, months 3/6/12, status sent/approved/rejected, decided_by, decided_at).
  - `ai_runs` (user, feature, course, status, charged, at).
- **Governance:**
  - `approvals` (object_type, object_id, approver_id, decision, remark, content_hash, at).
  - `audit_log`: append-only, with actor, action, object_type, object_id, detail jsonb and at; no update or delete grants.

## 2. Access (`0002_access.sql`)

- Helper functions per rule 02.
- Enable RLS everywhere; revoke all from anon.
- Policies:
  - Profiles: read self, plus same-institution staff; super admin reads all.
  - Org tables: read within the institution; write by super admin only.
  - Approvals and audit: read rules per rule 04.

## 3. Workflows (`0003_workflows.sql`, this phase's part)

- `handle_new_user()` trigger on `auth.users` insert:
  - Find the invite by lower(email) and check the domain matches the institution.
  - Create the profile from the invite and mark the invite accepted.
  - Students with pending enrolments get enrolled.
  - Otherwise raise `not_invited` or `domain_mismatch`.
- `admin_invite(email, role, name, institution, school, department)`: super admin only; domain must match; audit.
- `admin_set_active(user, active)`.
- `decide_subscription(request, approve)`: on approval, set the institution's plan, plan_start and plan_end = start + months − 1 day.
- `ai_usage()` and `consume_ai_credit(feature, course)`:
  - Checks the plan is active, the daily cap (IST midnight reset) and the total cap.
  - Returns the run id; refusal codes are `no_plan`, `daily_cap` and `total_cap`.
- `ai_usage_report()` for super admin.
- `audit(action, type, id, detail)` helper, service/definer only.

## 4. Edge function

`send-invites`: staff only; sends the invitation email (Supabase Auth admin `inviteUserByEmail` or SMTP) with the class code when present; rate-limited.

## 5. UI

- **Landing (G1):** XeIO and Elzeo, what it does in three short sections, a "Sign in" link. Static and fast, no inline scripts.
- **Sign in (G2):**
  - Match `Main.dc.html` exactly.
  - Google and Microsoft OAuth with `login_hint`, plus the email link with `shouldCreateUser: false`.
  - Domain check against `VITE_ALLOWED_DOMAINS` before calling.
  - Errors mapped from codes.
- **Session and routing (G3):**
  - `SessionProvider` (session, profile, institution, `restored`, signOut) and `RequireRole`.
  - The router sends each role to its home and keeps `state.from` for deep links.
  - Deactivated or not-onboarded users see messages and stay on sign-in.
  - Not-found page.
- **Admin console (A1–A5):** `ConsoleShell` (rail with tabs and badges, top bar with email and sign out) plus Users, Institutions, Subscriptions (plan cards with "N institutions · N faculty active", requests with "valid until"), AI credits (usage bars, status, valid until, "Move to Elite/Pro") and Audit (actor names, CSV export via a Blob download).

## 6. Tests

- **DB:**
  - Sign-up refused without an invite or on the wrong domain; the role comes from the invite.
  - Only super admin can invite or change plans.
  - AI caps: daily and total, with no charge on refund.
  - Audit is append-only.
  - Approvals are scoped to the institution.
- **Unit:** credit status logic; error mapping; domain check.
- **E2E:**
  - Each of the seven roles lands in its portal.
  - A student refused from `/app/admin`.
  - A not-onboarded account is refused, as is a deactivated one.
  - A deep link is kept through sign-in.
  - Axe on landing and sign-in.
- **Screens:** sign-in, admin users, subscriptions, credits, audit.

Then run `/xeio-parity-check` for G1–G3 and A1–A5, then `/xeio-release-gate`, write the walkthrough and stop.
