import { expect, test } from '@playwright/test';

test.describe('Phase 4 E2E: Student Lab IDE, restore on refresh, and Faculty Live Sessions', () => {
  test('student opens lab IDE, runs visible tests without hidden inputs, and restores code on refresh', async ({
    page,
  }) => {
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
          full_name: 'Demo Student',
          role: 'student',
          school_id: null,
          department_id: 'dept-1',
          roll_no: '2301034',
          active: true,
          calendar_token: 'tok-stu',
        }),
      }),
    );
    await page.route('**/rest/v1/sessions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 's-1',
          course_id: 'c-1',
          n: 1,
          topic: 'Pointers & Arrays',
          co_id: null,
          btl: 3,
          scheduled_date: '2027-01-04',
          status: 'active',
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
          allowed_langs: ['c', 'cpp', 'python'],
          attainment_target: 60,
          final_status: 'draft',
        }),
      }),
    );
    await page.route('**/rest/v1/session_questions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ session_id: 's-1', slot: 1, question_id: 'q-1' }]),
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
            title: 'Sum Two Numbers',
            statement: 'Read two integers and print their sum.',
            input_spec: 'a b',
            output_spec: 'a + b',
            constraints: '1 <= a, b <= 1000',
            status: 'approved',
            source: 'ai',
            valid: true,
            validation_note: 'OK',
          },
        ]),
      }),
    );
    await page.route('**/rest/v1/test_cases*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ question_id: 'q-1', ord: 1, input: '2 3', expected: '5', hidden: false }]),
      }),
    );
    await page.route('**/rest/v1/drafts*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ question_id: 'q-1', lang: 'c', code: '/* restored-draft-code */\nint main(){return 0;}' }]),
      }),
    );
    await page.route('**/functions/v1/run-code', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          visiblePassed: 1,
          visibleTotal: 1,
          hiddenPassed: 0,
          hiddenTotal: 0,
          visible: [{ ord: 1, input: '2 3', expected: '5', actual: '5', passed: true }],
          maxRuntimeMs: 14,
        }),
      }),
    );

    await page.goto('/app/student/lab/s-1');
    await expect(page.getByRole('heading', { name: 'Sum Two Numbers' })).toBeVisible();
    await expect(page.getByText('restored-draft-code')).toBeVisible();

    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByLabel('Console output')).toContainText('Test 1: PASS');

    await page.reload();
    await expect(page.getByText('restored-draft-code')).toBeVisible();
  });

  test('faculty deep link to /app/faculty/c/c-1/sessions renders Live monitor', async ({ page }) => {
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
    await page.route('**/rest/v1/batches*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'b-1', course_id: 'c-1', name: 'Batch A', class_code: 'XK7M2P', slot: 'Tue 10:00', room: 'Lab 1', staff: [] }]),
      }),
    );
    await page.route('**/rest/v1/sessions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 's-1', course_id: 'c-1', n: 1, topic: 'Loops', co_id: null, btl: 3, scheduled_date: '2027-01-04', status: 'active' }]),
      }),
    );

    await page.goto('/app/faculty/c/c-1/sessions');
    await expect(page.getByRole('heading', { name: 'Sessions (live lab)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Live monitor' })).toBeVisible();
  });
});
