import { describe, expect, it } from 'vitest';
import { approvalAgeLabel, hodSuggestions } from '../../src/lib/logic/oversight';

describe('Phase 6 unit: oversight helpers', () => {
  it('formats approval queue age and builds rule-based HOD suggestions', () => {
    const now = new Date('2027-02-01T12:00:00Z');
    expect(approvalAgeLabel('2027-02-01T11:30:00Z', now)).toBe('30m');
    expect(approvalAgeLabel('2027-02-01T08:00:00Z', now)).toBe('4h');
    expect(approvalAgeLabel('2027-01-29T12:00:00Z', now)).toBe('3d');

    const lines = hodSuggestions([
      { code: 'CSL-101', title: 'C Lab', plan_status: 'sent', final_status: 'submitted', at_risk: 3, completion_pct: 68 },
    ]);
    expect(lines).toHaveLength(3);
  });
});
