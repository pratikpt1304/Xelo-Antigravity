const IST_ZONE = 'Asia/Kolkata';

export function formatIstDate(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatIstDateTime(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function todayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}
