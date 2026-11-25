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
  allowed_langs: ['c'],
  attainment_target: 60,
  final_status: 'hod_approved',
};

test.describe('Phase 6 E2E: HOD Overview & CoE Internals', () => {
  test('HOD lands on Overview with Approvals badge', async ({ page }) => {
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

    await page.goto('/app/hod');
    await expect(page.getByRole('heading', { name: 'Department overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Approvals\s*1/ })).toBeVisible();
  });

  test('CoE sees HOD-approved internals and Accept button', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-placeholder-auth-token',
        JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 9999999999,
          refresh_token: 'fake-refresh',
          user: { id: 'uid-coe', email: 'coe@sanjivani.edu.in', aud: 'authenticated', role: 'authenticated' },
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
        id: 'uid-coe',
        institution_id: 'inst-1',
        email: 'coe@sanjivani.edu.in',
        full_name: 'CoE',
        role: 'coe',
        school_id: null,
        department_id: null,
        roll_no: null,
        active: true,
        calendar_token: 'tok-3',
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

    await page.goto('/app/oversight');
    await page.locator('nav button', { hasText: 'Internals' }).click();
    await expect(page.getByRole('button', { name: 'Accept into results' })).toBeVisible();
  });
});
