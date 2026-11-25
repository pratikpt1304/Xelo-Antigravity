import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const INST = {
  id: 'inst-1',
  name: 'Sanjivani University',
  email_domain: 'sanjivani.edu.in',
  plan: 'pro',
  plan_start: '2027-01-01',
  plan_end: '2027-06-30',
  min_attendance_pct: 75,
  attainment_threshold: 60,
};

async function seedSession(
  page: Page,
  opts: {
    id: string;
    email: string;
    role: string;
    active?: boolean;
    notOnboarded?: boolean;
  },
) {
  await page.addInitScript(
    ({ id, email }) => {
      localStorage.setItem(
        'sb-placeholder-auth-token',
        JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 9999999999,
          refresh_token: 'fake-refresh',
          user: { id, email, aud: 'authenticated', role: 'authenticated' },
        }),
      );
    },
    { id: opts.id, email: opts.email },
  );

  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.route('**/rest/v1/profiles*', (route) => {
    if (opts.notOnboarded) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    const single = route.request().url().includes('id=eq.');
    const prof = {
      id: opts.id,
      institution_id: INST.id,
      email: opts.email,
      full_name: `Test ${opts.role}`,
      role: opts.role,
      school_id: null,
      department_id: null,
      roll_no: null,
      active: opts.active ?? true,
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
      body: JSON.stringify(single ? INST : [INST]),
    });
  });

  await page.route('**/rest/v1/schools*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/departments*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/invites*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/plans*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/subscription_requests*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/audit_log*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/rpc/ai_usage_report', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

test.describe('Phase 1 E2E: Role routing, refusals, deep links, and accessibility', () => {
  const roleCases = [
    { role: 'super_admin', expectedUrl: '/app/admin', heading: 'Users and roles' },
    { role: 'vc', expectedUrl: '/app/oversight', heading: 'Oversight monitor' },
    { role: 'coe', expectedUrl: '/app/oversight', heading: 'Oversight monitor' },
    { role: 'dean', expectedUrl: '/app/oversight', heading: 'Oversight monitor' },
    { role: 'hod', expectedUrl: '/app/hod', heading: 'Department overview' },
    { role: 'faculty', expectedUrl: '/app/faculty', heading: 'My courses' },
    { role: 'student', expectedUrl: '/app/student', heading: 'My labs' },
  ];

  for (const tc of roleCases) {
    test(`routes ${tc.role} to ${tc.expectedUrl}`, async ({ page }) => {
      await seedSession(page, {
        id: `uid-${tc.role}`,
        email: `${tc.role}@sanjivani.edu.in`,
        role: tc.role,
      });
      await page.goto('/app/');
      await expect(page).toHaveURL((url) => url.pathname === tc.expectedUrl);
      await expect(page.getByRole('heading', { name: tc.heading })).toBeVisible();
    });
  }

  test('refuses student from /app/admin and redirects to /app/student', async ({ page }) => {
    await seedSession(page, {
      id: 'uid-student',
      email: 'student@sanjivani.edu.in',
      role: 'student',
    });
    await page.goto('/app/admin');
    await expect(page).toHaveURL(/\/app\/student$/);
  });

  test('refuses not-onboarded account with clear message', async ({ page }) => {
    await seedSession(page, {
      id: 'uid-missing',
      email: 'missing@sanjivani.edu.in',
      role: 'faculty',
      notOnboarded: true,
    });
    await page.goto('/app/faculty');
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByRole('alert')).toContainText("isn't onboarded yet");
  });

  test('refuses deactivated account with clear message', async ({ page }) => {
    await seedSession(page, {
      id: 'uid-disabled',
      email: 'disabled@sanjivani.edu.in',
      role: 'faculty',
      active: false,
    });
    await page.goto('/app/faculty');
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByRole('alert')).toContainText('deactivated');
  });

  test('preserves deep link across sign-in', async ({ page }) => {
    await seedSession(page, {
      id: 'uid-faculty',
      email: 'faculty@sanjivani.edu.in',
      role: 'faculty',
    });
    await page.goto('/app/faculty/courses');
    await expect(page).toHaveURL(/\/app\/faculty\/courses$/);
    await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  });

  test('renders NotFound page for unknown routes', async ({ page }) => {
    await page.goto('/app/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('passes axe accessibility checks on landing and sign-in', async ({ page }) => {
    await page.goto('/');
    const landingResults = await new AxeBuilder({ page }).analyze();
    const landingSevere = landingResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(landingSevere).toEqual([]);

    await page.goto('/app/login');
    const loginResults = await new AxeBuilder({ page }).analyze();
    const loginSevere = loginResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(loginSevere).toEqual([]);
  });
});
