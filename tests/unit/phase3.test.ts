import { describe, expect, it } from 'vitest';
import { normalise, outputsMatch, parseRunRequest, summarise } from '../../src/lib/logic/judge';
import { overlaps, parseMcqCsv, parseQuestionsJson, pickTwo } from '../../src/lib/logic/prep';

describe('Phase 3 unit: judge helpers & prep logic', () => {
  it('normalises trailing whitespace/newlines and matches outputs', () => {
    expect(normalise('1 2  \r\n3   \n\n')).toBe('1 2\n3');
    expect(outputsMatch('42 \n', '42')).toBe(true);
    expect(outputsMatch('41', '42')).toBe(false);
  });

  it('summarises verdicts and redacts hidden test inputs/outputs', () => {
    const summary = summarise([
      { ord: 1, input: 'vis-in', expected: '10', hidden: false, actual: '10', runtimeMs: 12 },
      { ord: 2, input: 'secret-in', expected: '99', hidden: true, actual: '0', runtimeMs: 18 },
    ]);
    expect(summary.visiblePassed).toBe(1);
    expect(summary.visibleTotal).toBe(1);
    expect(summary.hiddenPassed).toBe(0);
    expect(summary.hiddenTotal).toBe(1);
    expect(summary.maxRuntimeMs).toBe(18);
    expect(JSON.stringify(summary)).not.toContain('secret-in');
    expect(JSON.stringify(summary)).not.toContain('99');
  });

  it('validates run request payload and 50k char limit', () => {
    expect(() =>
      parseRunRequest({ question_id: '1234567890', lang: 'c', code: 'x'.repeat(50001), mode: 'run', context: 'lab' }),
    ).toThrow('invalid_code');
    const ok = parseRunRequest({
      question_id: '1234567890',
      lang: 'python',
      code: 'print(1)',
      mode: 'submit',
      context: 'lab',
    });
    expect(ok.mode).toBe('submit');
  });

  it('picks two valid candidates preferring medium + hard', () => {
    const picked = pickTwo([
      { id: '1', difficulty: 'easy', valid: true },
      { id: '2', difficulty: 'medium', valid: true },
      { id: '3', difficulty: 'hard', valid: false },
      { id: '4', difficulty: 'hard', valid: true },
    ]);
    expect(picked?.map((p) => p.id)).toEqual(['2', '4']);
  });

  it('detects bank overlaps and parses MCQ CSV and question JSON', () => {
    const ov = overlaps(
      [{ id: 'p1', stem: 'What is the time complexity of binary search in sorted array?' }],
      [{ id: 'q1', stem: 'What is the time complexity of binary search in a sorted array?' }],
    );
    expect(ov).toHaveLength(1);

    const mcqs = parseMcqCsv('stage,level,question,options,answer\npre,easy,2+2?,3|4|5|6,B\nbad,row');
    expect(mcqs).toHaveLength(1);
    expect(mcqs[0]?.answer).toBe(1);

    const qs = parseQuestionsJson(
      JSON.stringify([
        {
          title: 'Sum',
          statement: 'Add two numbers',
          difficulty: 'easy',
          tests: [{ input: '1 2', expected: '3', hidden: false }],
          reference_c: 'int main(){}',
        },
      ]),
    );
    expect(qs).toHaveLength(1);
    expect(() => parseQuestionsJson('{"not":"array"}')).toThrow();
  });
});
