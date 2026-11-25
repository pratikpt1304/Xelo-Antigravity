export interface RosterRow {
  roll: string;
  name: string;
  email: string;
}

export function parseRosterCsv(text: string): RosterRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const rows: RosterRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i]!.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) continue;
    const [roll, name, email] = parts;
    if (i === 0 && (roll?.toLowerCase() === 'roll' || email?.toLowerCase() === 'email')) {
      continue;
    }
    if (roll && name && email) {
      rows.push({ roll, name, email: email.toLowerCase() });
    }
  }
  return rows;
}

export function validateRosterRows(
  rows: ReadonlyArray<RosterRow>,
  expectedDomain: string,
): { valid: RosterRow[]; invalid: Array<{ row: RosterRow; reason: string }> } {
  const dom = expectedDomain.trim().toLowerCase();
  const valid: RosterRow[] = [];
  const invalid: Array<{ row: RosterRow; reason: string }> = [];

  for (const row of rows) {
    const em = row.email.trim().toLowerCase();
    const at = em.lastIndexOf('@');
    if (at <= 0 || em.slice(at + 1) !== dom) {
      invalid.push({ row, reason: `Expected @${dom}` });
    } else {
      valid.push({ ...row, email: em });
    }
  }
  return { valid, invalid };
}

export function splitBatchesEvenly<T>(items: ReadonlyArray<T>, maxPerBatch = 65): T[][] {
  if (items.length === 0) return [];
  const batchCount = Math.max(1, Math.ceil(items.length / maxPerBatch));
  const base = Math.floor(items.length / batchCount);
  const rem = items.length % batchCount;
  const result: T[][] = [];
  let offset = 0;
  for (let i = 0; i < batchCount; i++) {
    const size = base + (i < rem ? 1 : 0);
    result.push(items.slice(offset, offset + size));
    offset += size;
  }
  return result;
}
