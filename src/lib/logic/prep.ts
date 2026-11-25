export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface CandidateForPick {
  id: string;
  difficulty: DifficultyLevel;
  valid: boolean;
}

export function pickTwo<T extends CandidateForPick>(cands: ReadonlyArray<T>): [T, T] | null {
  const valid = cands.filter((c) => c.valid);
  if (valid.length < 2) return null;

  const med = valid.find((c) => c.difficulty === 'medium');
  const hard = valid.find((c) => c.difficulty === 'hard');
  if (med && hard) return [med, hard];

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (valid[i]!.difficulty !== valid[j]!.difficulty) {
        return [valid[i]!, valid[j]!];
      }
    }
  }
  return [valid[0]!, valid[1]!];
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) {
    if (tb.has(w)) inter++;
  }
  return inter / (ta.size + tb.size - inter);
}

export function overlaps(
  pre: ReadonlyArray<{ id: string; stem: string }>,
  post: ReadonlyArray<{ id: string; stem: string }>,
  threshold = 0.8,
): Array<{ preId: string; postId: string; score: number }> {
  const found: Array<{ preId: string; postId: string; score: number }> = [];
  for (const a of pre) {
    for (const b of post) {
      const score = similarity(a.stem, b.stem);
      if (score >= threshold) {
        found.push({ preId: a.id, postId: b.id, score });
      }
    }
  }
  return found;
}

export interface ParsedMcq {
  bank: 'pre' | 'post';
  level: DifficultyLevel;
  stem: string;
  options: string[];
  answer: number;
}

export function parseMcqCsv(text: string): ParsedMcq[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ParsedMcq[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 5) continue;
    const [stageRaw, levelRaw, stem, optsRaw, ansRaw] = cols;
    if (i === 0 && stageRaw?.toLowerCase() === 'stage') continue;

    const bank = stageRaw?.toLowerCase() === 'post' ? 'post' : stageRaw?.toLowerCase() === 'pre' ? 'pre' : null;
    const level =
      levelRaw?.toLowerCase() === 'easy' ||
      levelRaw?.toLowerCase() === 'medium' ||
      levelRaw?.toLowerCase() === 'hard'
        ? (levelRaw.toLowerCase() as DifficultyLevel)
        : null;
    const options = (optsRaw ?? '')
      .split('|')
      .map((o) => o.trim())
      .filter(Boolean);
    const ansIdx = (ansRaw ?? '').toUpperCase().charCodeAt(0) - 65;

    if (!bank || !level || !stem || options.length < 2 || options.length > 6) continue;
    if (Number.isNaN(ansIdx) || ansIdx < 0 || ansIdx >= options.length) continue;

    out.push({ bank, level, stem, options, answer: ansIdx });
  }
  return out;
}

export interface ParsedQuestion {
  title: string;
  statement: string;
  difficulty: DifficultyLevel;
  co_code: string;
  input_spec: string;
  output_spec: string;
  constraints: string;
  tests: Array<{ input: string; expected: string; hidden: boolean }>;
  reference_c: string;
}

export function parseQuestionsJson(text: string): ParsedQuestion[] {
  const raw = JSON.parse(text) as unknown;
  if (!Array.isArray(raw)) throw new Error('invalid_json_array');
  const out: ParsedQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw new Error('invalid_question_item');
    const q = item as Record<string, unknown>;
    if (typeof q.title !== 'string' || typeof q.statement !== 'string' || !Array.isArray(q.tests)) {
      throw new Error('invalid_question_fields');
    }
    const diff =
      q.difficulty === 'easy' || q.difficulty === 'medium' || q.difficulty === 'hard'
        ? q.difficulty
        : 'medium';
    out.push({
      title: q.title,
      statement: q.statement,
      difficulty: diff,
      co_code: typeof q.co_code === 'string' ? q.co_code : 'CO1',
      input_spec: typeof q.input_spec === 'string' ? q.input_spec : '',
      output_spec: typeof q.output_spec === 'string' ? q.output_spec : '',
      constraints: typeof q.constraints === 'string' ? q.constraints : '',
      tests: q.tests as Array<{ input: string; expected: string; hidden: boolean }>,
      reference_c: typeof q.reference_c === 'string' ? q.reference_c : '',
    });
  }
  return out;
}
