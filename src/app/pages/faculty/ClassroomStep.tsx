import { useState, type FormEvent } from 'react';
import { Banner, Card, Chip, Empty, Modal, PageHead } from '../../../components/ui';
import { formatIstDate, todayIso } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/hooks';
import { weekOf } from '../../../lib/logic/monitor';
import { useSession } from '../../../lib/session';
import { fn, must, supabase } from '../../../lib/supabase';
import type { BatchRow, Course, PendingEnrollmentRow, SessionRow } from '../../../lib/types';

interface ClassItemRow {
  id: string;
  course_id: string;
  week: number;
  kind: 'task' | 'resource' | 'announcement';
  task_type: string | null;
  title: string;
  body: string;
  payload: { options?: string[] };
  url: string | null;
  file_path: string | null;
  created_at: string;
}

interface ClassResponseRow {
  id: string;
  item_id: string;
  student_id: string;
  answer: Record<string, unknown>;
  score: number;
  submitted_at: string;
}

export function ClassroomStep({
  course,
  batches,
  pending,
  sessions,
  enrolledCount,
}: {
  course: Course;
  batches: BatchRow[];
  pending: PendingEnrollmentRow[];
  sessions: SessionRow[];
  enrolledCount: number;
}) {
  const { profile } = useSession();
  const [week, setWeek] = useState(1);
  const [kind, setKind] = useState<'task' | 'resource' | 'announcement'>('task');
  const [taskType, setTaskType] = useState<'quiz' | 'fill' | 'predict' | 'debug' | 'assignment' | 'poll'>('quiz');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [draftOptions, setDraftOptions] = useState<string[]>([]);
  const [respModalItem, setRespModalItem] = useState<ClassItemRow | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data, reload } = useLoad(async () => {
    const [itemRes, respRes] = await Promise.all([
      supabase.from('class_items').select('*').eq('course_id', course.id).order('created_at'),
      supabase.from('class_responses').select('*'),
    ]);
    return {
      items: must(itemRes) as ClassItemRow[],
      responses: must(respRes) as ClassResponseRow[],
    };
  }, [course.id]);

  const draftTaskAction = useAction(async () => {
    const topic = sessions.find((s) => s.n === week)?.topic ?? course.title;
    if (kind === 'announcement') {
      const res = await fn<{ draft: { title: string; body: string } }>('ai-generate', {
        kind: 'announcement',
        course_id: course.id,
        topic,
      });
      setTitle(res.draft.title);
      setBody(res.draft.body);
      return;
    }
    const res = await fn<{
      draft: { title: string; body: string; options?: string[]; answer: { choice?: string; text?: string } };
    }>('ai-generate', {
      kind: 'class_task',
      course_id: course.id,
      task_type: taskType,
      topic,
    });
    setTitle(res.draft.title);
    setBody(res.draft.body);
    setDraftOptions(res.draft.options ?? []);
    setAnswerKey(res.draft.answer.choice ?? res.draft.answer.text ?? '');
  });

  const addAction = useAction(async (filePath: string | null) => {
    const { data: inserted, error } = await supabase
      .from('class_items')
      .insert({
        course_id: course.id,
        week,
        kind,
        task_type: kind === 'task' ? taskType : null,
        title: title.trim(),
        body: body.trim(),
        payload: draftOptions.length ? { options: draftOptions } : {},
        url: url.trim() || null,
        file_path: filePath,
        created_by: profile?.id ?? null,
      })
      .select('id')
      .single();
    if (error || !inserted) throw new Error(error?.message ?? 'failed');

    if (kind === 'task' && answerKey.trim()) {
      await supabase.from('class_answer_keys').insert({
        item_id: inserted.id,
        answer: { choice: answerKey.trim() },
      });
    }
  });

  const handleUploadResource = async (file: File | undefined) => {
    if (!file) return;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${course.id}/${Date.now()}-${safeName}`;
    await supabase.storage.from('class-files').upload(path, file);
    if (!title.trim()) setTitle(file.name);
    await addAction.run(path);
    setMsg({ tone: 'ok', text: `Uploaded ${file.name} to Week ${week}.` });
    setTitle('');
    setBody('');
    reload();
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await addAction.run(null);
    setMsg({ tone: 'ok', text: `Added to Week ${week}.` });
    setTitle('');
    setBody('');
    setUrl('');
    setAnswerKey('');
    setDraftOptions([]);
    reload();
  };

  const termStart = sessions[0]?.scheduled_date ?? todayIso();
  const currentWeek = weekOf(todayIso(), termStart);
  const weekItems = (data?.items ?? []).filter((i) => i.week === week);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 7 · RUN"
        title="Classroom"
        lead="Weekly timeline of Assist tasks, file resources, and announcements."
        actions={
          <button type="button" className="xe-btn" onClick={() => setWeek(Math.min(30, Math.max(1, currentWeek)))}>
            Jump to this week (W{currentWeek})
          </button>
        }
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}

      <Card title="Class status">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {batches.map((b) => (
            <Chip key={b.id} tone="good">
              {b.name}: {b.class_code}
            </Chip>
          ))}
          <span className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            Joined: {enrolledCount} · Pending: {pending.length}
          </span>
        </div>
      </Card>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {Array.from({ length: Math.max(6, Math.min(30, sessions.length || 6)) }, (_, i) => i + 1).map((w) => (
          <button
            key={w}
            type="button"
            className={`xe-btn xe-mono ${week === w ? 'xe-btn--primary' : ''}`}
            onClick={() => setWeek(w)}
          >
            W{w}{w === currentWeek ? ' · Now' : ''}
          </button>
        ))}
      </div>

      <Card
        title={`Add to Week ${week}`}
        actions={
          kind !== 'resource' ? (
            <button
              type="button"
              className="xe-btn xe-btn--assist"
              disabled={draftTaskAction.busy}
              onClick={() => void draftTaskAction.run()}
            >
              Draft with Assist
            </button>
          ) : null
        }
      >
        <form onSubmit={(e) => void handleAdd(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <label className="xe-field">
              <span>Kind</span>
              <select
                className="xe-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'task' | 'resource' | 'announcement')}
              >
                <option value="task">Task</option>
                <option value="resource">Resource</option>
                <option value="announcement">Announcement</option>
              </select>
            </label>
            {kind === 'task' ? (
              <label className="xe-field">
                <span>Task type</span>
                <select
                  className="xe-select"
                  value={taskType}
                  onChange={(e) =>
                    setTaskType(
                      e.target.value as 'quiz' | 'fill' | 'predict' | 'debug' | 'assignment' | 'poll',
                    )
                  }
                >
                  <option value="quiz">Quiz</option>
                  <option value="fill">Fill in the code</option>
                  <option value="predict">Predict the output</option>
                  <option value="debug">Debug</option>
                  <option value="assignment">Assignment</option>
                  <option value="poll">Poll</option>
                </select>
              </label>
            ) : null}
            <label className="xe-field" style={{ flex: 1 }}>
              <span>Title</span>
              <input className="xe-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
          </div>

          <label className="xe-field">
            <span>Details</span>
            <textarea
              className="xe-input"
              style={{ height: 70, padding: 8 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          {kind === 'task' ? (
            <label className="xe-field">
              <span>Answer key (faculty only)</span>
              <input
                className="xe-input"
                value={answerKey}
                onChange={(e) => setAnswerKey(e.target.value)}
                placeholder="Option or expected answer"
              />
            </label>
          ) : null}

          {kind === 'resource' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <label className="xe-field" style={{ flex: 1 }}>
                <span>HTTPS link</span>
                <input
                  className="xe-input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="xe-field">
                <span>Or upload file (max 20 MB)</span>
                <input type="file" onChange={(e) => void handleUploadResource(e.target.files?.[0])} />
              </label>
            </div>
          ) : null}

          <div>
            <button type="submit" className="xe-btn xe-btn--primary" disabled={addAction.busy}>
              Add to this week
            </button>
          </div>
        </form>
      </Card>

      <Card title={`Week ${week} items`}>
        {weekItems.length === 0 ? (
          <Empty message="No items posted for this week yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {weekItems.map((item) => {
              const respCount = (data?.responses ?? []).filter((r) => r.item_id === item.id).length;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <Chip tone="neutral">{item.task_type ?? item.kind}</Chip>
                      <strong>{item.title}</strong>
                    </div>
                    {item.body ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>{item.body}</div> : null}
                  </div>
                  {item.kind === 'task' ? (
                    <button type="button" className="xe-btn" onClick={() => setRespModalItem(item)}>
                      Responses ({respCount})
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(respModalItem)}
        title={`Responses · ${respModalItem?.title ?? ''}`}
        onClose={() => setRespModalItem(null)}
      >
        <div className="xe-table-wrap">
          <table className="xe-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Score</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {(data?.responses ?? [])
                .filter((r) => r.item_id === respModalItem?.id)
                .map((r) => (
                  <tr key={r.id}>
                    <td className="xe-mono">{r.student_id.slice(0, 8)}</td>
                    <td className="xe-mono">{r.score}</td>
                    <td className="xe-mono" style={{ fontSize: 12 }}>{formatIstDate(r.submitted_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
