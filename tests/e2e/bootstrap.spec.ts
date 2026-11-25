import { expect, test } from '@playwright/test';

test.describe('Phase 0 bootstrap', () => {
  test('landing page serves with strict CSP and security headers', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);

    const headers = res?.headers() ?? {};
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).not.toContain('wasm-unsafe-eval');
    expect(headers['permissions-policy']).toContain('camera=()');

    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
  });

  test('/app/login placeholder serves with app CSP and permissions policy', async ({ page }) => {
    const res = await page.goto('/app/login');
    expect(res?.status()).toBe(200);

    const headers = res?.headers() ?? {};
    expect(headers['content-security-policy']).toContain("'wasm-unsafe-eval'");
    expect(headers['permissions-policy']).toContain('camera=(self)');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
