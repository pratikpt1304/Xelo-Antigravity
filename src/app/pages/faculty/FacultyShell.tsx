import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Card, Chip, Elzeo, Wordmark } from '../../../components/ui';
import { NotificationBell } from '../../../components/NotificationBell';
import { formatIstDate } from '../../../lib/format';
import { nextBestActions, parseAskCommand } from '../../../lib/logic/ask';
import { useSession } from '../../../lib/session';
import type { AiUsageSummary, Course, SessionRow } from '../../../lib/types';

export interface FacultyStepDef {
  id: string;
  group: 'Plan' | 'Prepare' | 'Run' | 'Complete';
  label: string;
  meta: string;
  locked: boolean;
}

export function FacultyShell({
  course,
  activeStep,
  steps,
  aiUsage,
  sessions,
  coCount,
  batchCount,
  children,
}: {
  course: Course;
  activeStep: string;
  steps: FacultyStepDef[];
  aiUsage: AiUsageSummary | null;
  sessions: SessionRow[];
  coCount: number;
  batchCount: number;
  children: ReactNode;
}) {
  const { profile, signOut } = useSession();
  const navigate = useNavigate();
  const [askInput, setAskInput] = useState('');
  const [askReply, setAskReply] = useState<string | null>(null);

  const groups: Array<'Plan' | 'Prepare' | 'Run' | 'Complete'> = [
    'Plan',
    'Prepare',
    'Run',
    'Complete',
  ];

  const handleAsk = (e: FormEvent) => {
    e.preventDefault();
    const res = parseAskCommand(askInput);
    if (!res) {
      setAskReply('Try "open setup", "open batches", "open session plan", or "open sessions".');
      return;
    }
    setAskReply(res.note);
    navigate(`/faculty/c/${course.id}/${res.step}`);
  };

  const actions = nextBestActions({
    planStatus: course.plan_status,
    coCount,
    batchCount,
    sessionCount: sessions.length,
  });

  const todaySessions = sessions.filter((s) => s.status === 'active').slice(0, 4);
  const aiLeft = aiUsage ? Math.max(0, aiUsage.total_cap - aiUsage.used_total) : 0;

  return (
    <div className="xe-fac-shell">
      <aside className="xe-fac-rail xe-dark" aria-label="Lab lifecycle">
        <div style={{ padding: '0 6px' }}>
          <div style={{ fontSize: 20 }}>
            <Wordmark dark assist />
          </div>
          <div style={{ fontSize: 11, color: '#A8A69E' }}>Faculty workspace</div>
        </div>

        <div style={{ padding: 10, border: '1px solid #2C2B28', borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: '#A8A69E' }}>Course</div>
          <div style={{ fontWeight: 600 }}>
            {course.code} {course.title}
          </div>
          <div style={{ fontSize: 12, color: '#A8A69E' }}>
            {course.section} · Sem {course.semester} · {course.academic_year}
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/faculty" style={{ fontSize: 12, color: '#CFCDC5' }}>
              ← All my courses
            </Link>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{
                  padding: '0 8px 4px',
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#8F8D85',
                }}
              >
                {g}
              </div>
              {steps
                .filter((s) => s.group === g)
                .map((s) => {
                  const active = s.id === activeStep;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={s.locked}
                      className={`xe-console-nav-btn ${active ? 'xe-console-nav-btn--active' : ''}`}
                      style={s.locked ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                      onClick={() => {
                        if (!s.locked) navigate(`/faculty/c/${course.id}/${s.id}`);
                      }}
                    >
                      <span style={{ flex: 1, textAlign: 'left' }}>{s.label}</span>
                      <span className="xe-mono" style={{ fontSize: 11, color: '#A8A69E' }}>
                        {s.meta}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '0 8px',
            fontSize: 12,
          }}
        >
          <Link to={`/faculty/c/${course.id}/preview`} style={{ color: '#CFCDC5' }}>
            Preview as student
          </Link>
          <span style={{ color: '#A8A69E' }}>{profile?.full_name}</span>
          <button
            type="button"
            className="xe-btn"
            style={{ background: '#2C2B28', borderColor: '#3D3B36', color: '#FFFFFF' }}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8F8D85' }}>
            <span>by</span>
            <Elzeo dark />
          </div>
        </div>
      </aside>

      <div className="xe-fac-main-wrap">
        <header className="xe-fac-topbar">
          <form onSubmit={handleAsk} style={{ flex: '1 1 360px', display: 'flex', gap: 8 }}>
            <label htmlFor="ask-assist" style={{ position: 'absolute', left: -9999 }}>
              Ask Assist
            </label>
            <input
              id="ask-assist"
              className="xe-input"
              style={{ flex: 1 }}
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              placeholder="Ask Assist: open setup, open batches, open session plan…"
            />
            <button type="submit" className="xe-btn xe-btn--primary">
              Ask
            </button>
          </form>

          <Chip tone="neutral">No live lab</Chip>

          {aiUsage ? (
            <div style={{ minWidth: 150, fontSize: 11 }}>
              <div className="xe-mono" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>
                  AI · {aiUsage.plan ? aiUsage.plan.toUpperCase() : 'None'}
                </span>
                <span>{aiLeft} left</span>
              </div>
              <div className="xe-mono" style={{ color: 'var(--muted)' }}>
                Today {aiUsage.used_today}/{aiUsage.daily_cap}
              </div>
            </div>
          ) : null}

          <NotificationBell />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{profile?.full_name}</span>
        </header>

        {askReply ? (
          <div style={{ padding: '8px 24px 0' }}>
            <Banner tone="info">{askReply}</Banner>
          </div>
        ) : null}

        <div className="xe-fac-cols">
          <main className="xe-fac-center">{children}</main>

          <aside className="xe-fac-right" aria-label="Assist guidance">
            <Card title="Next best actions">
              {actions.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  Plan steps are complete. Continue to Prepare.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {actions.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        background: 'var(--assist-tint)',
                        border: '1px solid #F1D9C6',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 13 }}>{act.text}</div>
                      <button
                        type="button"
                        className="xe-btn xe-btn--assist"
                        onClick={() => navigate(`/faculty/c/${course.id}/${act.step}`)}
                      >
                        {act.cta}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Today agenda">
              {todaySessions.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  No labs scheduled for today.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {todaySessions.map((s) => (
                    <div key={s.id} style={{ fontSize: 13 }}>
                      <span className="xe-mono">S{s.n}</span> · {s.topic}
                      {s.scheduled_date ? (
                        <div className="xe-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {formatIstDate(s.scheduled_date)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
