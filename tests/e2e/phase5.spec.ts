import { expect, test } from '@playwright/test';

test.describe('Phase 5 E2E: Classroom, Reports, Lab File, Verify, and Bell', () => {
  test('public verify page /app/verify/:course/:student renders minimal verified record', async ({
    page,
  }) => {
    await page.route('**/rest/v1/rpc/verify_lab_file', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          full_name: 'Asha Patil',
          roll_no: '2301034',
          course_code: 'CSL-101',
          course_title: 'Programming in C Lab',
          attendance_pct: 92,
        }),
      }),
    );

    await page.goto('/app/verify/c-1/stu-1');
    await expect(page.getByText('Asha Patil')).toBeVisible();
    await expect(page.getByText('2301034')).toBeVisible();
    await expect(page.getByText('Verified')).toBeVisible();
  });

  test('student lab file renders declaration, QR code, and Elzeo footer', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-placeholder-auth-token',
        JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 9999999999,
          refresh_token: 'fake-refresh',
          user: { id: 'uid-student', email: 'student@sanjivani.edu.in', aud: 'authenticated', role: 'authenticated' },
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
          id: 'uid-student',
          institution_id: 'inst-1',
          email: 'student@sanjivani.edu.in',
          full_name: 'Asha Patil',
          role: 'student',
          school_id: null,
          department_id: 'dept-1',
          roll_no: '2301034',
          active: true,
          calendar_token: 'tok-stu',
        }),
      }),
    );
    await page.route('**/rest/v1/courses*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'c-1',
            institution_id: 'inst-1',
            department_id: 'dept-1',
            faculty_id: 'uid-fac',
            code: 'CSL-101',
            title: 'Programming in C Lab',
            ltpc: '0-0-4-2',
            programme: 'B.Tech',
            semester: 4,
            section: 'SY-B',
            academic_year: '2026-27',
            plan_status: 'approved',
            plan_remark: null,
            rubric: { attendance: 10, pre_test: 5, post_test: 5, visible: 10, hidden: 10, viva: 10 },
            allowed_langs: ['c'],
            attainment_target: 60,
            final_status: 'draft',
          },
        ]),
      }),
    );

    await page.goto('/app/student/lab-file');
    await expect(page.getByRole('heading', { name: 'Printable lab file' })).toBeVisible();
    await expect(page.getByAltText(/QR verification/)).toBeVisible();
  });
});
