import { describe, expect, it } from 'vitest';
import { formatIstDate, formatIstDateTime, todayIso } from '../../src/lib/format';

describe('format helpers', () => {
  it('formats IST dates and ISO day consistently', () => {
    const sample = new Date('2027-01-15T18:45:00.000Z');
    // 18:45 UTC is 00:15 IST on 16 Jan 2027
    expect(todayIso(sample)).toBe('2027-01-16');
    expect(formatIstDate(sample)).toContain('16');
    expect(formatIstDate(sample)).toContain('2027');
    expect(formatIstDateTime(sample)).toContain('2027');
  });
});
