import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Card, Chip, Empty, ErrorNote, Loading, PageHead } from '../../../components/ui';
import { CalendarFeedCard } from '../../../components/CalendarFeedCard';
import { formatIstDate, todayIso } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/hooks';
import { attendancePct, internalOutOf100, sessionMarks } from '../../../lib/logic/rubric';
import { must, rpc, supabase } from '../../../lib/supabase';
import type {
  AttendanceRow,
  Course,
  EnrollmentRow,
  SessionRow,
  SubmissionRow,
  TestAttemptRow,
  VivaRow,
} from '../../../lib/types';
import { StudentShell } from './StudentShell';

export function StudentHome() {
  const [classCode, setClassCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [enrRes, courseRes, sessRes, attRes, subRes, testRes, vivaRes] = await Promise.all([
      supabase.from('enrollments').select('*'),
      supabase.from('courses').select('*').order('code'),
      supabase.from('sessions').select('*').order('n'),
      supabase.from('attendance').select('*'),
      supabase.from('submissions').select('*'),
      supabase.from('test_attempts').select('*'),
      supabase.from('viva').select('*'),
    ]);

    return {
      enrollments: must(enrRes) as EnrollmentRow[],
      courses: must(courseRes) as Course[],
      sessions: must(sessRes) as SessionRow[],
      attendance: must(attRes) as AttendanceRow[],
      submissions: must(subRes) as SubmissionRow[],
      attempts: must(testRes) as TestAttemptRow[],
      vivas: must(vivaRes) as VivaRow[],
    };
  }, []);

  const joinAction = useAction(async () => {
    return await rpc<string>('join_with_code', { p_code: classCode.trim().toUpperCase() });
  });

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!classCode.trim()) return;
    const cid = await joinAction.run();
    if (cid) {
      setClassCode('');
      setMsg({ tone: 'ok', text: 'Joined course.' });
      reload();
    }
  };

  const today = todayIso();
  const todaySess =
    data?.sessions.find(
      (s) => s.scheduled_date === today && (s.status === 'active' || s.status === 'conducted'),
    ) ??
    data?.sessions.find((s) => s.status === 'active') ??
    null;

  const preAttempt = todaySess
    ? data?.attempts.find((a) => a.session_id === todaySess.id && a.bank === 'pre')
    : undefined;
  const postAttempt = todaySess
    ? data?.attempts.find((a) => a.session_id === todaySess.id && a.bank === 'post')
    : undefined;

  return (
    <StudentShell todaySessionId={todaySess?.id}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHead
          kicker="STUDENT HOME"
          title="My labs"
          lead="Today's lab, upcoming sessions, and enrolled courses."
        />

        {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
        {joinAction.message ? <Banner tone={joinAction.message.tone}>{joinAction.message.text}</Banner> : null}
        {error ? <ErrorNote message={error} /> : null}

        <Card title="Join with class code">
          <form onSubmit={(e) => void handleJoin(e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              aria-label="Class code"
              className="xe-input xe-mono"
              style={{ width: 160, textTransform: 'uppercase' }}
              placeholder="XK7M2P"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
            />
            <button type="submit" className="xe-btn xe-btn--primary" disabled={joinAction.busy}>
              Join course
            </button>
          </form>
        </Card>

        {loading || !data ? (
          <Loading />
        ) : (
          <>
            {todaySess ? (
              <Card
                title={`Today's lab · S${todaySess.n} ${todaySess.topic}`}
                actions={<Chip tone="good">Open</Chip>}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {preAttempt?.submitted_at ? (
                    <Chip tone="good">Pre-test {preAttempt.score}/5</Chip>
                  ) : (
                    <Link className="xe-btn" to={`/student/test/${todaySess.id}/pre`}>
                      Take pre-test
                    </Link>
                  )}

                  <Link className="xe-btn xe-btn--primary" to={`/student/lab/${todaySess.id}`}>
                    Open today&apos;s lab
                  </Link>

                  {postAttempt?.submitted_at ? (
                    <Chip tone="good">Post-test {postAttempt.score}/5</Chip>
                  ) : (
                    <Link className="xe-btn" to={`/student/test/${todaySess.id}/post`}>
                      Post-test
                    </Link>
                  )}
                </div>
              </Card>
            ) : null}

            {data.courses.length === 0 ? (
              <Empty message="No enrolled courses yet. Enter your batch class code above." />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 14,
                }}
              >
                {data.courses.map((c) => {
                  const cSess = data.sessions.filter((s) => s.course_id === c.id);
                  const conducted = cSess.filter((s) => s.status === 'conducted');
                  const totals = conducted.map((s) => {
                    const pre = data.attempts.find((a) => a.session_id === s.id && a.bank === 'pre')?.score ?? 0;
                    const post = data.attempts.find((a) => a.session_id === s.id && a.bank === 'post')?.score ?? 0;
                    const subs = data.submissions.filter((sub) => sub.session_id === s.id);
                    const viva = data.vivas.find((v) => v.session_id === s.id)?.marks ?? 0;
                    return sessionMarks(
                      {
                        attendance: 'present',
                        preCorrect: pre,
                        postCorrect: post,
                        questions: subs.map((x) => ({
                          visiblePassed: x.visible_passed,
                          visibleTotal: x.visible_total,
                          hiddenPassed: x.hidden_passed,
                          hiddenTotal: x.hidden_total,
                        })),
                        viva,
                      },
                      c.rubric,
                    ).total;
                  });
                  const internal = internalOutOf100(totals);
                  const attPct = attendancePct(data.attendance.map((a) => a.state));

                  return (
                    <Card key={c.id} title={`${c.code} · ${c.section}`}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{c.title}</div>
                      <div className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                        Internal: {internal}/100 · Attendance: {attPct}%
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link className="xe-btn" to={`/student/classroom`}>
                          Classroom
                        </Link>
                        {todaySess && todaySess.course_id === c.id ? (
                          <Link className="xe-btn xe-btn--primary" to={`/student/lab/${todaySess.id}`}>
                            Today&apos;s lab
                          </Link>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            <Card title="Upcoming sessions" noPadding>
              {data.sessions.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <Empty message="No sessions scheduled yet." />
                </div>
              ) : (
                <div className="xe-table-wrap">
                  <table className="xe-table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Date</th>
                        <th>Topic</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.slice(0, 8).map((s) => (
                        <tr key={s.id}>
                          <td className="xe-mono">S{s.n}</td>
                          <td className="xe-mono" style={{ fontSize: 12 }}>
                            {s.scheduled_date ? formatIstDate(s.scheduled_date) : '—'}
                          </td>
                          <td>{s.topic}</td>
                          <td>
                            <Chip tone={s.status === 'active' ? 'good' : 'neutral'}>{s.status}</Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <CalendarFeedCard />
          </>
        )}
      </div>
    </StudentShell>
  );
}
