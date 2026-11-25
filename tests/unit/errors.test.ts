import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../src/lib/errors';

describe('errorMessage mapping', () => {
  it('maps known database and auth error codes to user-friendly text', () => {
    expect(errorMessage(new Error('not_onboarded'))).toContain("isn't onboarded yet");
    expect(errorMessage(new Error('account_deactivated'))).toContain('deactivated');
    expect(errorMessage(new Error('daily_cap'))).toContain('midnight IST');
    expect(errorMessage(new Error('forbidden'))).toContain('permission');
    expect(errorMessage('some_internal_sql_error')).toBe('Something went wrong. Please try again.');
  });
});
