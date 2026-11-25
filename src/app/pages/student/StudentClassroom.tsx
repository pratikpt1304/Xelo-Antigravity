import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Card, Chip, Empty, ErrorNote, Loading, PageHead } from '../../../components/ui';
import { formatIstDate, todayIso } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/hooks';
import { weekOf } from '../../../lib/logic/monitor';
import { must, rpc, supabase } from '../../../lib/supabase';
import type { BatchRow, Course, SessionRow } from '../../../lib/types';
import { StudentShell } from './StudentShell';

interface StudentClassItem {
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
}

export function StudentClassroom() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [courseRes, batchRes, sessRes, itemRes, respRes] = await Promise.all([
      supabase.from('courses').select('*').limit(1),
      supabase.from('batches').select('*').limit(1),
      supabase.from('sessions').select('*').order('n'),
      supabase.from('class_items').select('*').order('week'),
      supabase.from('class_responses').select('*'),
    ]);
    return {
      course: (must(courseRes) as Course[])[0] ?? null,
      batch: (must(batchRes) as BatchRow[])[0] ?? null,
      sessions: must(sessRes) as SessionRow[],
      items: must(itemRes) as StudentClassItem[],
      responses: must(respRes) as Array<{ item_id: string; score: number }>,
    };
  }, []);

  const submitResp = useAction(async (itemId: string) => {
    const score = await rpc<number>('submit_class_response', {
      p_item_id: itemId,
      p_answer: { choice: answers[itemId] ?? '' },
    });
    setMsg({ tone: 'ok', text: `Submitted (score: ${score}).` });
    reload();
  });

  const openSignedFile = async (path: string) => {
    const { data: signed } = await supabase.storage.from('class-files').createSignedUrl(path, 300);
    if (signed?.signedUrl) {
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const termStart = data?.sessions[0]?.scheduled_date ?? todayIso();
  const currentWeek = weekOf(todayIso(), termStart);
  const respMap = new Map((data?.responses ?? []).map((r) => [r.item_id, r.score]));

  return (
    <StudentShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHead
          kicker="CLASSROOM"
          title={data?.course ? `${data.course.code} · ${data.course.title}` : 'Classroom'}
          lead={data?.batch ? `${data.batch.name} · ${data.batch.slot} · ${data.batch.room}` : ''}
        />

        {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
        {error ? <ErrorNote message={error} /> : null}

        {loading || !data ? (
          <Loading />
        ) : (
          <>
            <Card title="Labs" noPadding>
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Date</th>
                      <th>Topic</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.slice(0, 6).map((s) => (
                      <tr key={s.id}>
                        <td className="xe-mono">S{s.n}</td>
                        <td className="xe-mono" style={{ fontSize: 12 }}>
                          {s.scheduled_date ? formatIstDate(s.scheduled_date) : '—'}
                        </td>
                        <td>{s.topic}</td>
                        <td style={{ textAlign: 'right' }}>
                          {s.status === 'active' ? (
                            <Link className="xe-btn xe-btn--primary" to={`/student/lab/${s.id}`}>
                              Open lab
                            </Link>
                          ) : (
                            <Chip tone="neutral">{s.status}</Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {data.items.length === 0 ? (
              <Empty message="No classroom posts yet." />
            ) : (
              data.items.map((item) => {
                const doneScore = respMap.get(item.id);
                return (
                  <Card
                    key={item.id}
                    title={`Week ${item.week}${item.week === currentWeek ? ' (This week)' : ''} · ${item.title}`}
                    actions={<Chip tone={doneScore !== undefined ? 'good' : 'neutral'}>{item.task_type ?? item.kind}</Chip>}
                  >
                    {item.body ? <p style={{ margin: '0 0 10px' }}>{item.body}</p> : null}
                    {item.kind === 'resource' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {item.url ? (
                          <a className="xe-btn" href={item.url} target="_blank" rel="noopener noreferrer">
                            Open link
                          </a>
                        ) : null}
                        {item.file_path ? (
                          <button type="button" className="xe-btn" onClick={() => void openSignedFile(item.file_path!)}>
                            Download resource
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {item.kind === 'task' ? (
                      doneScore !== undefined ? (
                        <Chip tone="good">Done · score {doneScore}</Chip>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            aria-label={`Answer for ${item.title}`}
                            className="xe-input"
                            style={{ flex: 1 }}
                            value={answers[item.id] ?? ''}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Your answer"
                          />
                          <button
                            type="button"
                            className="xe-btn xe-btn--primary"
                            disabled={submitResp.busy}
                            onClick={() => void submitResp.run(item.id)}
                          >
                            Submit
                          </button>
                        </div>
                      )
                    ) : null}
                  </Card>
                );
              })
            )}
          </>
        )}
      </div>
    </StudentShell>
  );
}
