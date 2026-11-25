export type CreditStatus =
  | 'OK'
  | 'Running low'
  | 'Daily cap reached'
  | 'Subscription runs used up';

export function creditStatus(
  usedTotal: number,
  totalCap: number,
  usedToday: number,
  dailyCap: number,
): CreditStatus {
  const left = Math.max(0, totalCap - usedTotal);
  const todayLeft = dailyCap - usedToday;
  if (left <= 0) return 'Subscription runs used up';
  if (todayLeft <= 0) return 'Daily cap reached';
  if (totalCap > 0 && left < totalCap * 0.15) return 'Running low';
  return 'OK';
}

export function planEndDate(startIso: string, months: number): string {
  const d = new Date(`${startIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function parseAllowedDomains(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedDomain(email: string, allowedDomains: ReadonlyArray<string>): boolean {
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) return false;
  const domain = trimmed.slice(atIdx + 1);
  if (allowedDomains.length === 0) return true;
  return allowedDomains.includes(domain);
}
