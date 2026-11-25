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
  plan_status: 'approved',
  plan_remark: null,
  rubric: { attendance: 10, pre_test: 5, post_test: 5, visible: 10, hidden: 10, viva: 10 },
  allowed_langs: ['c'],
  attainment_target: 60,
  final_status: 'draft',
};

const SAMPLE_ASSESSMENT = {
  id: 'a-1',
  course_id: 'c-1',
  batch_id: 'b-1',
  rules: { mix: { easy: 12, medium: 18, hard: 10 }, langs: ['c'], duration_min: 120 },
  hod_status: 'approved',
  hod_remark: null,
  exam_date: '2026-11-25',
  start_at: '2026-11-25T10:00:00+05:30',
  end_at: '2026-11-25T12:00:00+05:30',
  room: 'Lab 204',
  stage: 'active',
  added_to_file: false,
};

test.describe('Phase 7 E2E: End-sem 6-stage & Student Proctored Exam', () => {
  test('Faculty sees 6-stage Assessments stepper and Student loads End-sem & MediaPipe wasm under CSP', async ({
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
          user: { id: 'uid-faculty', email: 'fac@sanjivani.edu.in', aud: 'authenticated', role: 'authenticated' },
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
        id: 'uid-faculty',
        institution_id: 'inst-1',
        email: 'fac@sanjivani.edu.in',
        full_name: 'Prof. Sharma',
        role: 'faculty',
        school_id: null,
        department_id: 'dept-1',
        roll_no: null,
        active: true,
        calendar_token: 'tok-f',
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? prof : [prof]),
      });
    });
    await page.route('**/rest/v1/institutions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inst-1',
          name: 'Sanjivani University',
          domain: 'sanjivani.edu.in',
          min_attendance_pct: 75,
        }),
      }),
    );
    await page.route('**/rest/v1/courses*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(route.request().url().includes('id=eq.') ? SAMPLE_COURSE : [SAMPLE_COURSE]),
      }),
    );
    await page.route('**/rest/v1/batches*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'b-1', course_id: 'c-1', name: 'Batch A', max_size: 65 }]),
      }),
    );
    await page.route('**/rest/v1/assessments*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(route.request().url().includes('batch_id=eq.') ? SAMPLE_ASSESSMENT : [SAMPLE_ASSESSMENT]),
      }),
    );

    await page.goto('/app/faculty/c/c-1/assessments');
    await expect(page.getByText('End-semester practical')).toBeVisible();
    await expect(page.getByText('1. Rules')).toBeVisible();
    await expect(page.getByText('2. Approve 30')).toBeVisible();
    await expect(page.getByText('6. Marks')).toBeVisible();
  });

  test('Student loads S8 End-sem check & MediaPipe wasm under /app/* CSP', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-placeholder-auth-token',
        JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 9999999999,
          refresh_token: 'fake-refresh',
          user: { id: 'uid-stu', email: 'stu@sanjivani.edu.in', aud: 'authenticated', role: 'authenticated' },
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
        id: 'uid-stu',
        institution_id: 'inst-1',
        email: 'stu@sanjivani.edu.in',
        full_name: 'Student One',
        role: 'student',
        school_id: null,
        department_id: 'dept-1',
        roll_no: 'SYB01',
        active: true,
        calendar_token: 'tok-s',
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? prof : [prof]),
      });
    });
    await page.route('**/rest/v1/institutions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inst-1',
          name: 'Sanjivani University',
          domain: 'sanjivani.edu.in',
          min_attendance_pct: 75,
        }),
      }),
    );
    await page.route('**/rest/v1/courses*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SAMPLE_COURSE]) }),
    );
    await page.route('**/rest/v1/assessments*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SAMPLE_ASSESSMENT]) }),
    );

    const cspErrors: string[] = [];
    page.on('pageerror', (e) => cspErrors.push(e.message));

    await page.goto('/app/student/endsem');
    await expect(page.getByText('Secure system check & waiting room')).toBeVisible();
    await expect(page.getByText(/No continuous video is recorded/i)).toBeVisible();
    await expect(page.getByText('Face detector ready')).toBeVisible({ timeout: 10000 });
    expect(cspErrors).toEqual([]);
  });
});
