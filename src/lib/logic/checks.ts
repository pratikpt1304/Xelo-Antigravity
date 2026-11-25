export interface Rubric {
  attendance: number;
  pre_test: number;
  post_test: number;
  visible: number;
  hidden: number;
  viva: number;
}

export interface PlanCheck {
  ok: boolean;
  text: string;
}

export function rubricTotal(r: Rubric): number {
  return r.attendance + r.pre_test + r.post_test + r.visible + r.hidden + r.viva;
}

export function planChecks(
  rubric: Rubric,
  cos: ReadonlyArray<{ id: string; btl: number }>,
  mappedCoIds: ReadonlySet<string>,
): PlanCheck[] {
  const total = rubricTotal(rubric);
  const allMapped = cos.length > 0 && cos.every((c) => mappedCoIds.has(c.id));
  const btls = new Set(cos.map((c) => c.btl));

  return [
    {
      ok: total === 50,
      text: total === 50 ? 'Rubric totals 50 marks' : `Rubric totals ${total} (must be 50)`,
    },
    {
      ok: allMapped,
      text: allMapped ? 'Every CO mapped to a PO' : 'Some COs have no PO mapping',
    },
    {
      ok: btls.size >= 2,
      text: btls.size >= 2 ? `BTL spread covers ${btls.size} levels` : 'BTL spread needs ≥ 2 levels',
    },
  ];
}
