import { describe, expect, it } from 'vitest';
import { creditStatus, isAllowedDomain, planEndDate } from '../../src/lib/logic/credits';

describe('credits & domain logic', () => {
  it('computes credit status across all thresholds', () => {
    expect(creditStatus(38, 125, 3, 5)).toBe('OK');
    expect(creditStatus(112, 125, 3, 5)).toBe('Running low');
    expect(creditStatus(112, 125, 5, 5)).toBe('Daily cap reached');
    expect(creditStatus(125, 125, 0, 5)).toBe('Subscription runs used up');
    expect(creditStatus(130, 125, 5, 5)).toBe('Subscription runs used up');
  });

  it('computes planEndDate as start + months - 1 day', () => {
    expect(planEndDate('2027-01-01', 6)).toBe('2027-06-30');
    expect(planEndDate('2027-03-01', 12)).toBe('2028-02-29');
  });

  it('validates institutional email domains', () => {
    expect(isAllowedDomain('faculty.demo@sanjivani.edu.in', ['sanjivani.edu.in'])).toBe(true);
    expect(isAllowedDomain('user@gmail.com', ['sanjivani.edu.in'])).toBe(false);
    expect(isAllowedDomain('invalid-email', ['sanjivani.edu.in'])).toBe(false);
  });
});
