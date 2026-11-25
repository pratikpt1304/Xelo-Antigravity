export interface TestCaseEvalInput {
  ord: number;
  input: string;
  expected: string;
  hidden: boolean;
  actual: string;
  compileError?: string;
  runtimeMs?: number;
}

export interface VisibleVerdict {
  ord: number;
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface JudgeSummary {
  visiblePassed: number;
  visibleTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  visible: VisibleVerdict[];
  compileError?: string;
  maxRuntimeMs: number;
}

export function normalise(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalise(actual) === normalise(expected);
}

export function toResult(tc: TestCaseEvalInput): {
  hidden: boolean;
  passed: boolean;
  visible?: VisibleVerdict;
} {
  const passed = !tc.compileError && outputsMatch(tc.actual, tc.expected);
  if (tc.hidden) {
    return { hidden: true, passed };
  }
  return {
    hidden: false,
    passed,
    visible: {
      ord: tc.ord,
      input: tc.input,
      expected: tc.expected,
      actual: tc.actual,
      passed,
    },
  };
}

export function summarise(cases: ReadonlyArray<TestCaseEvalInput>): JudgeSummary {
  const visible: VisibleVerdict[] = [];
  let visiblePassed = 0;
  let visibleTotal = 0;
  let hiddenPassed = 0;
  let hiddenTotal = 0;
  let maxRuntimeMs = 0;
  let compileError: string | undefined;

  for (const tc of cases) {
    if (tc.compileError && !compileError) compileError = tc.compileError;
    if (tc.runtimeMs && tc.runtimeMs > maxRuntimeMs) maxRuntimeMs = tc.runtimeMs;

    const r = toResult(tc);
    if (r.hidden) {
      hiddenTotal++;
      if (r.passed) hiddenPassed++;
    } else {
      visibleTotal++;
      if (r.passed) visiblePassed++;
      if (r.visible) visible.push(r.visible);
    }
  }

  return {
    visiblePassed,
    visibleTotal,
    hiddenPassed,
    hiddenTotal,
    visible,
    compileError,
    maxRuntimeMs,
  };
}

export interface ParsedRunRequest {
  question_id: string;
  lang: 'c' | 'cpp' | 'java' | 'python' | 'rust' | 'go';
  code: string;
  mode: 'run' | 'submit';
  context: 'lab' | 'exam';
  paper_id?: string;
}

const VALID_LANGS = new Set(['c', 'cpp', 'java', 'python', 'rust', 'go']);

export function parseRunRequest(raw: unknown): ParsedRunRequest {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_payload');
  const r = raw as Record<string, unknown>;
  if (typeof r.question_id !== 'string' || r.question_id.length < 10) {
    throw new Error('invalid_question');
  }
  if (typeof r.lang !== 'string' || !VALID_LANGS.has(r.lang)) {
    throw new Error('invalid_lang');
  }
  if (typeof r.code !== 'string' || r.code.length === 0 || r.code.length > 50000) {
    throw new Error('invalid_code');
  }
  const mode = r.mode === 'submit' ? 'submit' : r.mode === 'run' ? 'run' : null;
  const context = r.context === 'exam' ? 'exam' : r.context === 'lab' ? 'lab' : null;
  if (!mode || !context) throw new Error('invalid_mode');

  return {
    question_id: r.question_id,
    lang: r.lang as ParsedRunRequest['lang'],
    code: r.code,
    mode,
    context,
    paper_id: typeof r.paper_id === 'string' ? r.paper_id : undefined,
  };
}
