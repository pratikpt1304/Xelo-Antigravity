export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + 74)}`);
    i += 74;
  }
  return parts.join('\r\n');
}

export function buildIcs(
  events: ReadonlyArray<{ uid: string; title: string; day: string }>,
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elzeo Future Technologies//XeIO//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const ev of events) {
    const dt = ev.day.replace(/-/g, '');
    const summary = ev.title.replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, ' ');
    lines.push('BEGIN:VEVENT');
    lines.push(foldIcsLine(`UID:${ev.uid}@xeio`));
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(foldIcsLine(`SUMMARY:${summary}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
