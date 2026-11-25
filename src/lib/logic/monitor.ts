export interface AttemptLike {
  score: number;
  item_ids?: string[];
  answers?: Record<string, number>;
}

export interface BankItemLike {
  id: string;
  level: 'easy' | 'medium' | 'hard';
  answer?: number;
}

export function preTestAnalytics(
  attempts: ReadonlyArray<AttemptLike>,
  items: ReadonlyArray<BankItemLike>,
): {
  histogram: [number, number, number, number, number, number];
  levelPct: { easy: number; medium: number; hard: number };
  insight: string;
} {
  const hist: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const counts = { easy: { ok: 0, tot: 0 }, medium: { ok: 0, tot: 0 }, hard: { ok: 0, tot: 0 } };

  for (const att of attempts) {
    const s = Math.max(0, Math.min(5, att.score));
    hist[s] = (hist[s] ?? 0) + 1;
    if (!att.item_ids || !att.answers) continue;
    for (const id of att.item_ids) {
      const it = itemMap.get(id);
      if (!it || it.answer === undefined) continue;
      counts[it.level].tot++;
      if (att.answers[id] === it.answer) counts[it.level].ok++;
    }
  }

  const pct = (c: { ok: number; tot: number }) => (c.tot > 0 ? Math.round((c.ok / c.tot) * 100) : 0);
  const levelPct = {
    easy: pct(counts.easy),
    medium: pct(counts.medium),
    hard: pct(counts.hard),
  };

  let insight = 'No pre-test attempts recorded yet.';
  if (attempts.length > 0) {
    if (levelPct.hard < 40) {
      insight = 'Hard questions averaged under 40%; review edge cases before coding.';
    } else if (levelPct.medium < 60) {
      insight = 'Medium concepts need a quick 5-minute recap.';
    } else {
      insight = 'Class is well-prepared across all difficulty levels.';
    }
  }

  return { histogram: hist, levelPct, insight };
}

export interface MonitorAlert {
  studentId: string;
  kind: 'struggling' | 'idle';
  reason: string;
}

export function monitorAlerts(
  students: ReadonlyArray<string>,
  subs: ReadonlyArray<{ student_id: string; visible_passed: number; hidden_passed: number; created_at: string }>,
  lastDraft: ReadonlyMap<string, string>,
  absent: ReadonlySet<string>,
  now: Date = new Date(),
): MonitorAlert[] {
  const alerts: MonitorAlert[] = [];
  const fifteenMinAgo = now.getTime() - 15 * 60_000;

  for (const sid of students) {
    if (absent.has(sid)) continue;
    const mySubs = subs.filter((s) => s.student_id === sid);
    const anyPassed = mySubs.some((s) => s.visible_passed > 0 || s.hidden_passed > 0);

    if (mySubs.length >= 4 && !anyPassed) {
      alerts.push({
        studentId: sid,
        kind: 'struggling',
        reason: `${mySubs.length} runs with 0 tests passing`,
      });
      continue;
    }

    const lastSubTime = mySubs.reduce((max, s) => Math.max(max, new Date(s.created_at).getTime()), 0);
    const draftIso = lastDraft.get(sid);
    const draftTime = draftIso ? new Date(draftIso).getTime() : 0;
    const latest = Math.max(lastSubTime, draftTime);
    if (latest > 0 && latest < fifteenMinAgo) {
      alerts.push({
        studentId: sid,
        kind: 'idle',
        reason: 'Idle for 15+ min',
      });
    }
  }
  return alerts;
}

export function weekOf(sessionDateIso: string, termStartIso: string): number {
  const d1 = new Date(`${termStartIso}T00:00:00Z`).getTime();
  const d2 = new Date(`${sessionDateIso}T00:00:00Z`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2) || d2 < d1) return 1;
  return Math.floor((d2 - d1) / (7 * 86400_000)) + 1;
}
