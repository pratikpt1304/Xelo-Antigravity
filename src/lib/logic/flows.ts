export interface PlanDatesInput {
  start: string;
  end: string;
  weekdays: number[]; // 0=Sun..6=Sat
  holidays: ReadonlyArray<string>;
  sessions: number;
  reserveLast: boolean;
}

export interface PlanDatesResult {
  dates: string[];
  availableCount: number;
  shortBy: number;
}

export function planDates(input: PlanDatesInput): PlanDatesResult {
  const holidaySet = new Set(input.holidays);
  const weekdaySet = new Set(input.weekdays);
  const available: string[] = [];

  const cur = new Date(`${input.start}T00:00:00Z`);
  const end = new Date(`${input.end}T00:00:00Z`);

  if (!Number.isNaN(cur.getTime()) && !Number.isNaN(end.getTime())) {
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (weekdaySet.has(cur.getUTCDay()) && !holidaySet.has(iso)) {
        available.push(iso);
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const usable = input.reserveLast && available.length > 0 ? available.slice(0, -1) : available;
  // Two sessions per lab period (PRD §5.3)
  const slots: string[] = [];
  for (const d of usable) {
    slots.push(d, d);
  }

  const shortBy = Math.max(0, input.sessions - slots.length);
  return {
    dates: slots.slice(0, input.sessions),
    availableCount: slots.length,
    shortBy,
  };
}

export function suggestMerge(topics: ReadonlyArray<string>): { index: number; merged: string } | null {
  if (topics.length < 2) return null;
  let bestIdx = 0;
  let bestLen = Infinity;
  for (let i = 0; i < topics.length - 1; i++) {
    const len = topics[i]!.length + topics[i + 1]!.length;
    if (len < bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  return {
    index: bestIdx,
    merged: `${topics[bestIdx]} + ${topics[bestIdx + 1]}`,
  };
}

export function applyMerge(topics: ReadonlyArray<string>, index: number): string[] {
  if (index < 0 || index >= topics.length - 1) return [...topics];
  const next = [...topics];
  next.splice(index, 2, `${topics[index]} + ${topics[index + 1]}`);
  return next;
}
