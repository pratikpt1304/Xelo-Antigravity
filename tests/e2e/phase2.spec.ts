import { expect, test } from '@playwright/test';

const SAMPLE_COURSE = {
  id: 'c-1',
  institution_id: 'inst-1',
  department_id: 'dept-1',
  faculty_id: 'uid-faculty',
  code: 'CSL-101',
  title: 'Programming in C Lab',
  ltpc: '0-0-4-2',
  programme: 'B.Tech',
  semester: 4,
  section: 'SY-B',
  academic_year: '2026-27',
  plan_status: 'sent',
  plan_remark: null,
  rubric: { attendance: 10, pre_test: 5, post_test: 5, visible: 10, hidden: 10, viva: 10 },
  allowed_langs: ['c', 'cpp', 'java', 'python', 'rust', 'go'],
  attainment_target: 60,
  final_status: 'draft',
};

test.describe('Phase 2 E2E: Faculty workspace & HOD approvals', () => {
  test('faculty deep link to /app/faculty/c/c-1/setup renders Course setup', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-placeholder-auth-token',
        JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 9999999999,
          refresh_token: 'fake-refresh',
          user: { id: 'uid-faculty', email: 'faculty@sanjivani.edu.in', aud: 'authenticated', role: 'authenticated' },
        }),
      );
    });

    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/auth/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'uid-faculty',
          institution_id: 'inst-1',
          email: 'faculty@sanjivani.edu.in',
          full_name: 'Demo Faculty',
          role: 'faculty',
          school_id: null,
          department_id: 'dept-1',
          roll_no: null,
          active: true,
          calendar_token: 'tok-1',
        }),
      }),
    );
    await page.route('**/rest/v1/institutions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inst-1',
          name: 'Sanjivani University',
          email_domain: 'sanjivani.edu.in',
          plan: 'pro',
          plan_start: '2027-01-01',
          plan_end: '2027-06-30',
          min_attendance_pct: 75,
          attainment_threshold: 60,
        }),
      }),
    );
    await page.route('**/rest/v1/courses*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_COURSE) }),
    );
    await page.route('**/rest/v1/course_outcomes*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'co-1', course_id: 'c-1', code: 'CO1', statement: 'Write C programs', btl: 3, unit: 1 },
        ]),
      }),
    );
    await page.route('**/rest/v1/rpc/ai_usage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plan: 'pro',
          total_cap: 125,
          daily_cap: 5,
          used_total: 10,
          used_today: 1,
          plan_end: '2027-06-30',
        }),
      }),
    );

    await page.goto('/app/faculty/c/c-1/setup');
    await expect(page.getByRole('heading', { name: 'Course setup' })).toBeVisible();
    await expect(page.getByText('CSL-101 Programming in C Lab')).toBeVisible();
  });

  test('HOD sees submitted course plan in Approvals queue', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-placeholder-auth-token',
        JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 9999999999,
          refresh_token: 'fake-refresh',
          user: { id: 'uid-hod', email: 'hod@sanjivani.edu.in', aud: 'authenticated', role: 'authenticated' },
        }),
      );
    });

    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/auth/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/rest/v1/profiles*', (route) => {
      const single = route.request().url().includes('id=eq.');
      const prof = {
        id: 'uid-hod',
        institution_id: 'inst-1',
        email: 'hod@sanjivani.edu.in',
        full_name: 'HOD CSE',
        role: 'hod',
        school_id: null,
        department_id: 'dept-1',
        roll_no: null,
        active: true,
        calendar_token: 'tok-2',
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? prof : [prof]),
      });
    });
    await page.route('**/rest/v1/courses*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SAMPLE_COURSE]) }),
    );
    await page.route('**/rest/v1/course_outcomes*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'co-1', course_id: 'c-1', code: 'CO1', statement: 'Write C programs', btl: 3, unit: 1 },
        ]),
      }),
    );

    await page.goto('/app/hod');
    await page.getByRole('button', { name: /Approvals/ }).click();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve course plan' })).toBeVisible();
  });
});
