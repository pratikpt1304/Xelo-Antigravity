export function approvalAgeLabel(createdAtIso: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(createdAtIso).getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function hodSuggestions(
  courses: ReadonlyArray<{
    code: string;
    title: string;
    plan_status: string;
    final_status: string;
    at_risk: number;
    completion_pct: number;
  }>,
): string[] {
  const notes: string[] = [];
  for (const c of courses) {
    if (c.at_risk > 0) {
      notes.push(
        `${c.code} ${c.title} has ${c.at_risk} student(s) at risk and ${c.completion_pct}% completion.`,
      );
    }
    if (c.plan_status === 'sent') {
      notes.push(`${c.code} course plan is waiting for your approval.`);
    }
    if (c.final_status === 'submitted') {
      notes.push(`${c.code} final marks are ready to review and recommend to CoE.`);
    }
  }
  return notes.slice(0, 5);
}
