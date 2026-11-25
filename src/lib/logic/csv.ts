function escapeCell(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  withBom = true,
): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const body = lines.join('\r\n');
  return withBom ? `\uFEFF${body}` : body;
}

export function downloadCsv(filename: string, headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>): void {
  const csv = toCsv(headers, rows, true);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
