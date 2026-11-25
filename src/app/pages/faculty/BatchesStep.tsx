import { useState, type FormEvent } from 'react';
import { Banner, Card, Chip, Empty, Kpis, PageHead } from '../../../components/ui';
import { useAction } from '../../../lib/hooks';
import { parseRosterCsv, validateRosterRows } from '../../../lib/logic/roster';
import { useSession } from '../../../lib/session';
import { fn, rpc } from '../../../lib/supabase';
import type {
  BatchRow,
  Course,
  EnrollmentRow,
  PendingEnrollmentRow,
  SessionRow,
} from '../../../lib/types';

export function BatchesStep({
  course,
  batches,
  enrollments,
  pending,
  sessions,
  onReload,
}: {
  course: Course;
  batches: BatchRow[];
  enrollments: EnrollmentRow[];
  pending: PendingEnrollmentRow[];
  sessions: SessionRow[];
  onReload: () => void;
}) {
  const { institution } = useSession();
  const [csvText, setCsvText] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [moveStudentId, setMoveStudentId] = useState('');
  const [moveBatchId, setMoveBatchId] = useState('');

  const anyConducted = sessions.some((s) => s.status === 'conducted');

  const importAction = useAction(async () => {
    const parsed = parseRosterCsv(csvText);
    if (parsed.length === 0) throw new Error('empty_roster');
    const domain = institution?.email_domain ?? 'sanjivani.edu.in';
    const { valid, invalid } = validateRosterRows(parsed, domain);
    if (invalid.length > 0) {
      throw new Error('domain_mismatch');
    }
    return await rpc<{ total: number; batches: number }>('import_roster', {
      p_course_id: course.id,
      p_rows: valid,
    });
  });

  const resendAction = useAction(async () => {
    if (pending.length === 0) return;
    await fn('send-invites', {
      invites: pending.map((p) => ({
        email: p.email,
        full_name: p.full_name,
        class_code: batches.find((b) => b.id === p.batch_id)?.class_code,
      })),
    });
  });

  const moveAction = useAction(async () => {
    if (!moveStudentId || !moveBatchId) return;
    await rpc('move_student', {
      p_course_id: course.id,
      p_student_id: moveStudentId,
      p_to_batch_id: moveBatchId,
    });
  });

  const handleImport = async (e: FormEvent) => {
    e.preventDefault();
    const res = await importAction.run();
    if (res) {
      setMsg({ tone: 'ok', text: `Imported ${res.total} students across ${res.batches} batch(es).` });
      setCsvText('');
      onReload();
    }
  };

  const totalStudents = enrollments.length + pending.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 2 · PLAN"
        title="Batches and roster"
        lead="Import section roster (split evenly at ≤ 65), manage class codes, and send invites."
        actions={
          pending.length > 0 ? (
            <button
              type="button"
              className="xe-btn"
              disabled={resendAction.busy}
              onClick={() =>
                void resendAction.run().then(() =>
                  setMsg({ tone: 'ok', text: `Resent ${pending.length} invite(s).` }),
                )
              }
            >
              Resend {pending.length} invites
            </button>
          ) : null
        }
      />

      <Kpis
        items={[
          { label: 'Total students', value: totalStudents },
          { label: 'Joined', value: enrollments.length },
          { label: 'Invites pending', value: pending.length },
          { label: 'Batches', value: batches.length },
        ]}
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {importAction.message ? <Banner tone={importAction.message.tone}>{importAction.message.text}</Banner> : null}
      {moveAction.message ? <Banner tone={moveAction.message.tone}>{moveAction.message.text}</Banner> : null}

      <Card title="Import roster (CSV: roll, name, email)">
        <form onSubmit={(e) => void handleImport(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="xe-field">
            <span>Upload CSV or paste rows</span>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void file.text().then(setCsvText);
              }}
            />
          </label>
          <textarea
            className="xe-input xe-mono"
            style={{ height: 100, padding: 8, fontSize: 12 }}
            placeholder={`roll,name,email\n2301001,Asha Patil,asha@${institution?.email_domain ?? 'sanjivani.edu.in'}`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <div>
            <button type="submit" className="xe-btn xe-btn--primary" disabled={importAction.busy}>
              Import and split batches (≤ 65)
            </button>
          </div>
        </form>
      </Card>

      {batches.length === 0 ? (
        <Empty message="No batches yet. Import your roster above." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {batches.map((b) => {
            const bJoined = enrollments.filter((e) => e.batch_id === b.id);
            const bPending = pending.filter((p) => p.batch_id === b.id);
            return (
              <Card
                key={b.id}
                title={b.name}
                actions={<Chip tone="good">Code: {b.class_code}</Chip>}
              >
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                  {b.slot} · {b.room}
                </div>
                <div className="xe-mono" style={{ fontSize: 12 }}>
                  Joined: {bJoined.length} · Invited: {bPending.length}
                </div>
                {bPending.length > 0 ? (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12 }}>
                    {bPending.slice(0, 6).map((p) => (
                      <li key={p.id}>
                        <span className="xe-mono">{p.roll_no}</span> · {p.full_name}{' '}
                        <Chip tone="warn">Invited</Chip>
                      </li>
                    ))}
                    {bPending.length > 6 ? <li>+{bPending.length - 6} more</li> : null}
                  </ul>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {batches.length > 1 && enrollments.length > 0 && !anyConducted ? (
        <Card title="Move student between batches (before first session)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label className="xe-field">
              <span>Joined student</span>
              <select
                className="xe-select"
                value={moveStudentId}
                onChange={(e) => setMoveStudentId(e.target.value)}
              >
                <option value="">Select student</option>
                {enrollments.map((en) => (
                  <option key={en.id} value={en.student_id}>
                    {en.student_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="xe-field">
              <span>Target batch</span>
              <select
                className="xe-select"
                value={moveBatchId}
                onChange={(e) => setMoveBatchId(e.target.value)}
              >
                <option value="">Select batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="xe-btn"
              disabled={moveAction.busy}
              onClick={() => void moveAction.run().then(onReload)}
            >
              Move student
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
