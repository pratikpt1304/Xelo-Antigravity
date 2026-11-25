import { expect, test, type Page } from '@playwright/test';

async function seedFacultyPrep(page: Page) {
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
  await page.route('**/rest/v1/courses*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
        plan_status: 'approved',
        plan_remark: null,
        rubric: { attendance: 10, pre_test: 5, post_test: 5, visible: 10, hidden: 10, viva: 10 },
        allowed_langs: ['c', 'cpp', 'java', 'python', 'rust', 'go'],
        attainment_target: 60,
        final_status: 'draft',
      }),
    }),
  );
  await page.route('**/rest/v1/sessions*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 's-1', course_id: 'c-1', n: 1, topic: 'Pointers & Arrays', co_id: null, btl: 3, scheduled_date: '2027-01-04', status: 'draft' },
      ]),
    }),
  );
  await page.route('**/rest/v1/questions*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'q-1',
          course_id: 'c-1',
          kind: 'lab',
          session_id: 's-1',
          co_code: 'CO1',
          difficulty: 'medium',
          title: 'Array Reverse',
          statement: 'Reverse an array in place.',
          input_spec: '',
          output_spec: '',
          constraints: '',
          status: 'candidate',
          source: 'ai',
          valid: true,
          validation_note: 'Validated in 6 languages',
        },
        {
          id: 'q-2',
          course_id: 'c-1',
          kind: 'lab',
          session_id: 's-1',
          co_code: 'CO1',
          difficulty: 'hard',
          title: 'Broken Candidate',
          statement: 'Invalid candidate.',
          input_spec: '',
          output_spec: '',
          constraints: '',
          status: 'candidate',
          source: 'ai',
          valid: false,
          validation_note: 'Failed c on test 1',
        },
      ]),
    }),
  );
}

test.describe('Phase 3 E2E: F4 Lab questions & F5 Pre/post banks', () => {
  test('renders F4 Lab questions with valid and invalid greyed candidates', async ({ page }) => {
    await seedFacultyPrep(page);
    await page.goto('/app/faculty/c/c-1/questions');
    await expect(page.getByRole('heading', { name: 'Lab questions' })).toBeVisible();
    await expect(page.getByText('Array Reverse')).toBeVisible();
    await expect(page.getByText('Broken Candidate')).toBeVisible();
  });

  test('renders F5 Pre and post-test banks', async ({ page }) => {
    await seedFacultyPrep(page);
    await page.goto('/app/faculty/c/c-1/banks');
    await expect(page.getByRole('heading', { name: 'Pre and post-test banks' })).toBeVisible();
    await expect(page.getByText('2E · 2M · 1H')).toBeVisible();
  });
});
