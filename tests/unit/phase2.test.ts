import { describe, expect, it } from 'vitest';
import { planChecks } from '../../src/lib/logic/checks';
import { applyMerge, planDates, suggestMerge } from '../../src/lib/logic/flows';
import { parseRosterCsv, splitBatchesEvenly, validateRosterRows } from '../../src/lib/logic/roster';

describe('Phase 2 pure logic', () => {
  it('parses CSV, validates domain, and splits 126 into 63 + 63', () => {
    const csv = ['roll,name,email', '2301001,Asha,asha@sanjivani.edu.in', '2301002,Bob,bob@gmail.com'].join('\n');
    const parsed = parseRosterCsv(csv);
    expect(parsed).toHaveLength(2);
    const { valid, invalid } = validateRosterRows(parsed, 'sanjivani.edu.in');
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);

    const many = Array.from({ length: 126 }, (_, i) => i + 1);
    const batches = splitBatchesEvenly(many, 65);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(63);
    expect(batches[1]).toHaveLength(63);
  });

  it('computes planDates with holidays, weekdays, reserveLast, and shortBy', () => {
    const res = planDates({
      start: '2027-01-04', // Monday
      end: '2027-01-25',
      weekdays: [1], // Mondays: 4, 11, 18, 25
      holidays: ['2027-01-11'],
      sessions: 6,
      reserveLast: true,
    });
    // Mondays: 4, 18, 25 -> reserveLast drops 25 -> 2 days * 2 sessions = 4 slots -> shortBy 2
    expect(res.availableCount).toBe(4);
    expect(res.shortBy).toBe(2);
    expect(res.dates).toEqual(['2027-01-04', '2027-01-04', '2027-01-18', '2027-01-18']);
  });

  it('suggests and applies topic merge for shortest adjacent pair', () => {
    const topics = ['Pointers and dynamic memory', 'Arrays', 'Loops', 'Structures and unions'];
    const suggestion = suggestMerge(topics);
    expect(suggestion).toEqual({ index: 1, merged: 'Arrays + Loops' });
    expect(applyMerge(topics, suggestion!.index)).toEqual([
      'Pointers and dynamic memory',
      'Arrays + Loops',
      'Structures and unions',
    ]);
  });

  it('evaluates planChecks accurately', () => {
    const ok = planChecks(
      { attendance: 10, pre_test: 5, post_test: 5, visible: 10, hidden: 10, viva: 10 },
      [
        { id: '1', btl: 2 },
        { id: '2', btl: 3 },
      ],
      new Set(['1', '2']),
    );
    expect(ok.every((c) => c.ok)).toBe(true);
  });
});
