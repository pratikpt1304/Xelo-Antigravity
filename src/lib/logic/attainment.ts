export function attainmentLevel(
  pct: number,
  levels: { l1?: number; l2?: number; l3?: number } = {},
): 0 | 1 | 2 | 3 {
  const l1 = levels.l1 ?? 60;
  const l2 = levels.l2 ?? 70;
  const l3 = levels.l3 ?? 80;
  if (pct >= l3) return 3;
  if (pct >= l2) return 2;
  if (pct >= l1) return 1;
  return 0;
}

export function coAttainment(
  studentPcts: ReadonlyArray<number>,
  targetThreshold = 60,
): { pctAttaining: number; level: 0 | 1 | 2 | 3; mean: number } {
  if (studentPcts.length === 0) {
    return { pctAttaining: 0, level: 0, mean: 0 };
  }
  const attaining = studentPcts.filter((p) => p >= targetThreshold).length;
  const pctAttaining = Math.round((attaining / studentPcts.length) * 100);
  const mean = Math.round(studentPcts.reduce((a, b) => a + b, 0) / studentPcts.length);
  return {
    pctAttaining,
    level: attainmentLevel(pctAttaining),
    mean,
  };
}

export function overallAttainment(
  internalPct: number,
  endsemPct: number | null,
  weights: { internal?: number; endsem?: number } = {},
): number {
  if (endsemPct === null) return Math.round(internalPct);
  const wInt = weights.internal ?? 0.4;
  const wEnd = weights.endsem ?? 0.6;
  return Math.round(wInt * internalPct + wEnd * endsemPct);
}

export function poAttainment(
  coLevels: ReadonlyMap<string, number>,
  mappings: ReadonlyArray<{ co_id: string; po_code: string; level: number }>,
): Record<string, number> {
  const sums = new Map<string, { num: number; den: number }>();
  for (const m of mappings) {
    if (m.level <= 0) continue;
    const coLvl = coLevels.get(m.co_id);
    if (coLvl === undefined) continue;
    const cur = sums.get(m.po_code) ?? { num: 0, den: 0 };
    cur.num += coLvl * m.level;
    cur.den += m.level;
    sums.set(m.po_code, cur);
  }
  const out: Record<string, number> = {};
  for (const [po, v] of sums.entries()) {
    out[po] = v.den > 0 ? Number((v.num / v.den).toFixed(2)) : 0;
  }
  return out;
}
