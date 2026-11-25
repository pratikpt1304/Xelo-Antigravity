import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { screens } from './screens.config.mjs';

const outDir = resolve(process.cwd(), 'docs/ui/shots/built');
mkdirSync(outDir, { recursive: true });

const SAMPLE_INST = {
  id: 'inst-1',
  name: 'Sanjivani University',
  email_domain: 'sanjivani.edu.in',
  plan: 'pro',
  plan_start: '2027-01-01',
  plan_end: '2027-06-30',
  min_attendance_pct: 75,
  attainment_threshold: 60,
};

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

for (const screen of screens) {
  test(`screen: ${screen.id}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const role = screen.role;
    if (role) {
      const uid = `uid-${role}`;
      await page.addInitScript(
        ({ id, r }) => {
          localStorage.setItem(
            'sb-placeholder-auth-token',
            JSON.stringify({
              access_token: 'fake-token',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: 9999999999,
              refresh_token: 'fake-refresh',
              user: { id, email: `${r}@sanjivani.edu.in`, aud: 'authenticated', role: 'authenticated' },
            }),
          );
        },
        { id: uid, r: role },
      );
    }

    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/auth/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/rest/v1/profiles*', (route) => {
      const url = route.request().url();
      const single = url.includes('id=eq.');
      const r = role || 'super_admin';
      const prof = {
        id: `uid-${r}`,
        institution_id: 'inst-1',
        email: `${r}@sanjivani.edu.in`,
        full_name: `Demo ${r}`,
        role: r,
        school_id: null,
        department_id: 'dept-1',
        roll_no: null,
        active: true,
        calendar_token: 'tok-1',
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? prof : [prof]),
      });
    });
    await page.route('**/rest/v1/institutions*', (route) => {
      const single = route.request().url().includes('id=eq.');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? SAMPLE_INST : [SAMPLE_INST]),
      });
    });
    await page.route('**/rest/v1/plans*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { tier: 'pro', total_cap: 125, daily_cap: 5 },
          { tier: 'elite', total_cap: 250, daily_cap: 7 },
        ]),
      }),
    );
    await page.route('**/rest/v1/courses*', (route) => {
      const single = route.request().url().includes('id=eq.');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? SAMPLE_COURSE : [SAMPLE_COURSE]),
      });
    });
    await page.route('**/rest/v1/course_outcomes*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'co-1', course_id: 'c-1', code: 'CO1', statement: 'Write C programs', btl: 3, unit: 1 },
        ]),
      }),
    );
    await page.route('**/rest/v1/batches*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'b-1', course_id: 'c-1', name: 'Batch A', class_code: 'XK7M2P', slot: 'Tue 10:00', room: 'Lab 1', staff: [] },
        ]),
      }),
    );
    await page.route('**/rest/v1/sessions*', (route) => {
      const single = route.request().url().includes('id=eq.');
      const sess = { id: 's-1', course_id: 'c-1', n: 1, topic: 'Pointers & Arrays', co_id: null, btl: 3, scheduled_date: '2027-01-04', status: 'active' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? sess : [sess]),
      });
    });
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
        ]),
      }),
    );
    await page.route('**/rest/v1/rpc/ai_usage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plan: 'pro', total_cap: 125, daily_cap: 5, used_total: 10, used_today: 1, plan_end: '2027-06-30' }),
      }),
    );
    await page.route('**/rest/v1/rpc/ai_usage_report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/rest/v1/batches*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'b-1', course_id: 'c-1', name: 'Batch A', max_size: 65 }]),
      }),
    );
    await page.route('**/rest/v1/assessments*', (route) => {
      const single = route.request().url().includes('id=eq.') || route.request().url().includes('batch_id=eq.');
      const ass = {
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
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? ass : [ass]) });
    });
    await page.route('**/rest/v1/exam_papers*', (route) => {
      const single = route.request().url().includes('assessment_id=eq.');
      const paper = {
        id: 'p-1',
        assessment_id: 'a-1',
        student_id: 'uid-student',
        question_ids: ['q-1'],
        started_at: '2026-11-25T10:00:00+05:30',
        deadline: '2026-11-25T12:00:00+05:30',
        submitted_at: null,
        extra_minutes: 0,
        warnings: 0,
        flagged: false,
        status: 'started',
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? paper : [paper]),
      });
    });

    await page.goto(screen.path, { waitUntil: 'networkidle' });
    if (screen.tab) {
      await page.locator('nav button', { hasText: screen.tab }).click();
    }
    await page.screenshot({ path: resolve(outDir, `${screen.id}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
