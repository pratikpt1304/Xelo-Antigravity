export function mean(nums: ReadonlyArray<number>): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function sd(nums: ReadonlyArray<number>): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = nums.reduce((acc, x) => acc + (x - m) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

export function histogram(nums: ReadonlyArray<number>, bins = 10, max = 100): number[] {
  const counts = Array.from({ length: bins }, () => 0);
  const width = max / bins;
  for (const n of nums) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(n / width)));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return counts;
}

export function normalPdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export function classifyLearners<T extends { id: string; score: number }>(
  students: ReadonlyArray<T>,
): { slow: T[]; fast: T[] } {
  if (students.length === 0) return { slow: [], fast: [] };
  const sorted = [...students].sort((a, b) => a.score - b.score);
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));
  const bottomCount = Math.max(1, Math.ceil(sorted.length * 0.1));

  const bottomSet = new Set(sorted.slice(0, bottomCount).map((s) => s.id));
  const slow = sorted.filter((s) => s.score < 40 || bottomSet.has(s.id));
  const slowIds = new Set(slow.map((s) => s.id));
  const fast = sorted
    .slice(-topCount)
    .reverse()
    .filter((s) => !slowIds.has(s.id));

  return { slow, fast };
}
