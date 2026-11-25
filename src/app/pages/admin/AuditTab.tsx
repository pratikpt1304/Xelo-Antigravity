import { Card, Empty } from '../../../components/ui';
import { formatIstDateTime } from '../../../lib/format';
import { roleLabel, type AuditRow, type Profile } from '../../../lib/types';

function csvCell(v: string): string {
  const safe = v.replace(/"/g, '""');
  return `"${safe}"`;
}

export function AuditTab({ rows, profiles }: { rows: AuditRow[]; profiles: Profile[] }) {
  const actorMap = new Map(profiles.map((p) => [p.id, p]));

  const actorText = (actorId: string | null) => {
    if (!actorId) return 'System';
    const p = actorMap.get(actorId);
    return p ? `${p.full_name} · ${roleLabel(p.role)}` : actorId;
  };

  const exportCsv = () => {
    const header = ['When', 'Action', 'Object', 'Actor', 'Detail'];
    const lines = rows.map((r) => [
      csvCell(formatIstDateTime(r.at)),
      csvCell(r.action),
      csvCell(`${r.object_type}${r.object_id ? `:${r.object_id}` : ''}`),
      csvCell(actorText(r.actor_id)),
      csvCell(JSON.stringify(r.detail)),
    ]);
    const csv = [header.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xeio-audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      title="Audit log"
      actions={
        <button type="button" className="xe-btn" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
      }
      noPadding
    >
      {rows.length === 0 ? (
        <div style={{ padding: 16 }}>
          <Empty message="No audit events recorded yet." />
        </div>
      ) : (
        <div className="xe-table-wrap">
          <table className="xe-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Object</th>
                <th>Actor</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {formatIstDateTime(r.at)}
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.action}</td>
                  <td className="xe-mono" style={{ fontSize: 12 }}>
                    {r.object_type}
                    {r.object_id ? ` · ${r.object_id.slice(0, 8)}` : ''}
                  </td>
                  <td style={{ fontSize: 12 }}>{actorText(r.actor_id)}</td>
                  <td className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {JSON.stringify(r.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
